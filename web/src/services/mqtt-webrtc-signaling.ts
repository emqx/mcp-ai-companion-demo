import type { MqttClient as BaseMqttClient } from 'mqtt'
import type { WebRTCConfig, MediaConstraints, WebRTCCallbacks, ConnectionState } from '@/types/webrtc'
import { defaultWebRTCConfig, defaultMediaConstraints } from '@/config/webrtc'
import { webrtcLogger } from '@/utils/logger'

interface MqttWebRTCSignalingOptions {
  clientId?: string
  mqttClient: BaseMqttClient | null
  config?: Partial<WebRTCConfig>
  mediaConstraints?: Partial<MediaConstraints>
  callbacks?: WebRTCCallbacks
}

interface SignalingMessage {
  type: 'sdp_offer' | 'sdp_answer' | 'ice_candidate' | 'webrtc_terminated' | 'asr_response' | 'tts_text' | 'chat'
  data?: any
  reason?: string
  results?: string
  text?: string
}

export class MqttWebRTCSignaling {
  private mqttClient: BaseMqttClient | null
  private pc: RTCPeerConnection | null = null
  private localStream: MediaStream | null = null
  private remoteStream: MediaStream | null = null
  private config: WebRTCConfig
  private mediaConstraints: MediaConstraints
  private callbacks: WebRTCCallbacks
  private clientId: string
  private webrtcTopic: string
  private multimediaTopic: string
  private messageTopic: string
  private messageHandler: ((topic: string, message: Buffer) => void) | null = null
  private ttsText: string = ''

  constructor(options: MqttWebRTCSignalingOptions) {
    this.mqttClient = options.mqttClient
    this.clientId = options.clientId || `webrtc_client_${Math.random().toString(36).substring(7)}`
    this.config = { ...defaultWebRTCConfig, ...options.config }
    this.mediaConstraints = { ...defaultMediaConstraints, ...options.mediaConstraints }
    this.callbacks = options.callbacks || {}
    
    // Topics according to backend documentation:
    // Subscribe to: $webrtc/{device_id} (receive answer and candidates from proxy)
    // Publish to: $webrtc/{device_id}/multimedia_proxy (send offer and candidates to proxy)
    this.webrtcTopic = `$webrtc/${this.clientId}`  // Subscribe to receive from proxy
    this.multimediaTopic = `$webrtc/${this.clientId}/multimedia_proxy`  // Publish to send to proxy
    this.messageTopic = `$message/${this.clientId}`  // For other messages (ASR, TTS)
  }

  async connect(): Promise<void> {
    if (!this.mqttClient) {
      throw new Error('MQTT client not provided')
    }

    if (!this.mqttClient.connected) {
      throw new Error('MQTT client is not connected')
    }

    try {
      webrtcLogger.info('Step 1: Starting WebRTC signaling...')
      this.updateConnectionState('connecting')
      
      webrtcLogger.info('Step 2: Subscribing to WebRTC topics')
      await this.subscribeToTopics()
      
      webrtcLogger.info('Step 3: Setting up message handler')
      this.setupMessageHandler()
      
      webrtcLogger.info('Step 4: Initializing WebRTC peer connection')
      await this.setupWebRTC()
    } catch (error) {
      this.handleError(error as Error)
      throw error
    }
  }

  private async subscribeToTopics(): Promise<void> {
    if (!this.mqttClient) return

    const topics = [this.webrtcTopic, this.messageTopic]
    webrtcLogger.info(`📡 Subscribing to topics: ${topics.join(', ')}`)

    try {
      await new Promise<void>((resolve, reject) => {
        this.mqttClient!.subscribe(topics, { qos: 0 }, (err) => {
          if (err) {
            webrtcLogger.error(`❌ Failed to subscribe to topics: ${err.message}`)
            reject(err)
          } else {
            webrtcLogger.info(`✅ Subscribed to WebRTC topics: ${topics.join(', ')}`)
            resolve()
          }
        })
      })
    } catch (error) {
      throw new Error(`Failed to subscribe to MQTT topics: ${error}`)
    }
  }

  private setupMessageHandler(): void {
    if (!this.mqttClient) return

    this.messageHandler = (topic: string, message: Buffer) => {
      if (topic === this.webrtcTopic || topic === this.messageTopic) {
        try {
          const payload = JSON.parse(message.toString()) as SignalingMessage
          this.handleSignalingMessage(topic, payload)
        } catch (error) {
          webrtcLogger.error('❌ Failed to parse message')
        }
      }
    }

    this.mqttClient.on('message', this.messageHandler)
  }

  private async handleSignalingMessage(topic: string, message: SignalingMessage): Promise<void> {
    webrtcLogger.info(`📨 Received ${message.type} from ${topic}`)

    if (topic === this.webrtcTopic) {
      switch (message.type) {
        case 'sdp_answer':
          if (this.pc && message.data) {
            const answer = new RTCSessionDescription({
              type: 'answer',
              sdp: message.data.sdp || message.data
            })
            await this.pc.setRemoteDescription(answer)
            webrtcLogger.info('✅ Set remote SDP answer')
          }
          break

        case 'ice_candidate':
          if (this.pc && message.data) {
            const candidate = new RTCIceCandidate({
              candidate: message.data.candidate,
              sdpMLineIndex: message.data.sdpMLineIndex,
              sdpMid: message.data.sdpMid
            })
            await this.pc.addIceCandidate(candidate)
            webrtcLogger.info('✅ Added ICE candidate')
          }
          break

        case 'webrtc_terminated':
          webrtcLogger.warn(`WebRTC connection terminated: ${message.reason}`)
          this.callbacks.onError?.(new Error(`WebRTC terminated: ${message.reason}`))
          this.disconnect()
          break
      }
    } else if (topic === this.messageTopic) {
      switch (message.type) {
        case 'asr_response':
          webrtcLogger.info('🎤 ASR response received')
          this.callbacks.onASRResponse?.(message.results || '')
          break

        case 'tts_text':
          this.ttsText += message.text || ''
          webrtcLogger.info('🔊 TTS text received')
          break
      }
    }
  }

  private async setupWebRTC(): Promise<void> {
    webrtcLogger.info('📷 Getting user media...')
    this.localStream = await navigator.mediaDevices.getUserMedia(this.mediaConstraints)
    this.callbacks.onLocalStream?.(this.localStream)

    webrtcLogger.info('🔗 Creating peer connection')
    this.pc = new RTCPeerConnection({ iceServers: this.config.iceServers })
    this.remoteStream = new MediaStream()

    for (const track of this.localStream.getTracks()) {
      this.pc.addTrack(track, this.localStream)
    }

    this.setupPeerConnectionHandlers()

    webrtcLogger.info('📤 Creating and sending offer to backend')
    const offer = await this.pc.createOffer()
    webrtcLogger.info('✅ Offer created, setting as local description')
    
    await this.pc.setLocalDescription(offer)
    webrtcLogger.info('✅ Local description set, sending to backend via MQTT')
    
    this.sendSignal('sdp_offer', offer)
    webrtcLogger.info('📡 Offer sent to backend, waiting for answer...')
  }

  private setupPeerConnectionHandlers(): void {
    if (!this.pc) return

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        webrtcLogger.info('📡 ICE candidate generated, sending...')
        this.sendSignal('ice_candidate', event.candidate)
      } else {
        webrtcLogger.info('✅ ICE gathering completed (null candidate)')
      }
    }

    this.pc.onicegatheringstatechange = () => {
      if (!this.pc) return
      webrtcLogger.info(`🧊 ICE gathering state: ${this.pc.iceGatheringState}`)
    }

    this.pc.onconnectionstatechange = () => {
      if (!this.pc) return
      
      const state = this.pc.connectionState
      webrtcLogger.info(`🔄 Connection state: ${state}`)
      
      switch (state) {
        case 'connected':
          webrtcLogger.info('🎉 WebRTC connection established!')
          this.updateConnectionState('connected')
          break
        case 'disconnected':
          this.updateConnectionState('disconnected')
          break
        case 'failed':
          this.handleError(new Error(`Connection failed: ${state}`))
          break
        case 'closed':
          this.updateConnectionState('closed')
          break
      }
    }

    this.pc.ontrack = (event) => {
      webrtcLogger.info(`📺 Received ${event.track.kind} track`)
      if (this.remoteStream) {
        this.remoteStream.addTrack(event.track)
        this.callbacks.onRemoteStream?.(this.remoteStream)
      }
    }
  }

  private sendSignal(type: string, data: any): void {
    if (!this.mqttClient) {
      webrtcLogger.error('MQTT client not available')
      return
    }

    if (!this.mqttClient.connected) {
      webrtcLogger.error(`❌ Cannot send ${type}: MQTT client not connected`)
      return
    }

    const message = JSON.stringify({ type, data })
    webrtcLogger.info(`📤 Publishing ${type} to topic: ${this.multimediaTopic}`)
    
    this.mqttClient.publish(this.multimediaTopic, message, { qos: 0 }, (err) => {
      if (err) {
        webrtcLogger.error(`❌ Failed to send ${type}:`, err.message)
      } else {
        webrtcLogger.info(`✅ Successfully sent ${type}`)
      }
    })
  }

  private updateConnectionState(state: ConnectionState): void {
    this.callbacks.onConnectionStateChange?.(state)
  }

  private handleError(error: Error): void {
    webrtcLogger.error('❌ WebRTC error:', error.message)
    this.callbacks.onError?.(error)
    this.updateConnectionState('failed')
  }

  disconnect(): void {
    webrtcLogger.info('🔌 WebRTC Signaling: Starting disconnect...')
    
    try {
      // Stop local media streams
      if (this.localStream) {
        webrtcLogger.info('🎥 Stopping local stream tracks')
        this.localStream.getTracks().forEach(track => {
          track.stop()
          webrtcLogger.info(`🔇 Stopped local ${track.kind} track`)
        })
        this.localStream = null
      }

      // Stop remote media streams  
      if (this.remoteStream) {
        webrtcLogger.info('📺 Stopping remote stream tracks')
        this.remoteStream.getTracks().forEach(track => {
          track.stop()
          webrtcLogger.info(`🔇 Stopped remote ${track.kind} track`)
        })
        this.remoteStream = null
      }

      // Close peer connection
      if (this.pc) {
        webrtcLogger.info('🔗 Closing peer connection')
        this.pc.close()
        this.pc = null
      }

      // Clean up MQTT message handler and unsubscribe
      if (this.mqttClient && this.messageHandler) {
        webrtcLogger.info('📡 Removing MQTT message handler and unsubscribing')
        this.mqttClient.removeListener('message', this.messageHandler)
        
        // Unsubscribe from topics
        const topics = [this.webrtcTopic, this.messageTopic]
        this.mqttClient.unsubscribe(topics, {}, (err) => {
          if (err) {
            webrtcLogger.error(`❌ Failed to unsubscribe from topics: ${err.message}`)
          } else {
            webrtcLogger.info(`✅ Unsubscribed from topics: ${topics.join(', ')}`)
          }
        })
        
        this.messageHandler = null
      }

      // Reset state
      this.ttsText = ''
      this.updateConnectionState('disconnected')
      
      webrtcLogger.info('✅ WebRTC Signaling: Disconnect completed')
    } catch (error) {
      webrtcLogger.error('❌ Error during WebRTC signaling disconnect:', error)
      this.updateConnectionState('disconnected')
    }
  }

  async toggleAudio(enabled?: boolean): Promise<void> {
    if (!this.localStream) return
    
    const audioTracks = this.localStream.getAudioTracks()
    audioTracks.forEach(track => {
      track.enabled = enabled !== undefined ? enabled : !track.enabled
    })
  }

  toggleVideo(enabled?: boolean): void {
    if (!this.localStream) return
    
    const videoTracks = this.localStream.getVideoTracks()
    videoTracks.forEach(track => {
      track.enabled = enabled !== undefined ? enabled : !track.enabled
    })
  }

  sendChatMessage(message: string): void {
    this.sendSignal('chat', message)
  }

  getLocalStream(): MediaStream | null {
    return this.localStream
  }

  getConnectionState(): RTCPeerConnectionState | null {
    return this.pc?.connectionState || null
  }
}