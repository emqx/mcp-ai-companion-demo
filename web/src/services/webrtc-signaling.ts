import { Socket, Channel } from 'phoenix'
import type { WebRTCConfig, MediaConstraints, SignalingMessage, WebRTCCallbacks, ConnectionState } from '@/types/webrtc'
import { defaultWebRTCConfig, defaultMediaConstraints } from '@/config/webrtc'

export class WebRTCSignaling {
  private socket: Socket | null = null
  private channel: Channel | null = null
  private pc: RTCPeerConnection | null = null
  private localStream: MediaStream | null = null
  private remoteStream: MediaStream | null = null
  private config: WebRTCConfig
  private mediaConstraints: MediaConstraints
  private callbacks: WebRTCCallbacks
  private signalingId: string

  constructor(
    signalingId: string,
    config: Partial<WebRTCConfig> = {},
    mediaConstraints: Partial<MediaConstraints> = {},
    callbacks: WebRTCCallbacks = {}
  ) {
    this.signalingId = signalingId
    this.config = { ...defaultWebRTCConfig, ...config }
    this.mediaConstraints = { ...defaultMediaConstraints, ...mediaConstraints }
    this.callbacks = callbacks
  }

  async connect(): Promise<void> {
    try {
      this.updateConnectionState('connecting')
      
      // Create Phoenix socket
      this.socket = new Socket(this.config.signalingUrl, {
        params: { token: (window as any).userToken },
        logger: (kind, msg, data) => {
          console.log(`Phoenix Socket [${kind}]:`, msg, data)
        }
      })
      
      this.socket.onOpen(() => {
        console.log('Phoenix socket connected successfully')
      })
      
      this.socket.onError((error) => {
        console.error('Phoenix socket error:', error)
        this.handleError(new Error('Socket connection failed'))
      })
      
      this.socket.onClose(() => {
        console.log('Phoenix socket disconnected')
      })
      
      this.socket.connect()

      // Join signaling channel
      this.channel = this.socket.channel(this.signalingId)
      
      await this.joinChannel()
      await this.setupWebRTC()
    } catch (error) {
      this.handleError(error as Error)
      throw error
    }
  }

  private joinChannel(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.channel) {
        reject(new Error('Channel not initialized'))
        return
      }

      this.channel
        .join()
        .receive('ok', (resp: any) => {
          console.log('Joined successfully to signaling socket', resp)
          resolve()
        })
        .receive('error', (resp: any) => {
          console.error('Unable to join signaling socket', resp)
          reject(new Error('Failed to join signaling channel'))
        })
    })
  }

  private async setupWebRTC(): Promise<void> {
    // Get user media
    this.localStream = await navigator.mediaDevices.getUserMedia(this.mediaConstraints)
    this.callbacks.onLocalStream?.(this.localStream)

    // Create peer connection
    this.pc = new RTCPeerConnection({ iceServers: this.config.iceServers })

    // Initialize remote stream
    this.remoteStream = new MediaStream()

    // Add local tracks
    for (const track of this.localStream.getTracks()) {
      this.pc.addTrack(track, this.localStream)
    }

    // Set up event handlers
    this.setupPeerConnectionHandlers()
    this.setupChannelHandlers()

    // Create and send offer
    const offer = await this.pc.createOffer()
    await this.pc.setLocalDescription(offer)
    console.log('Sent SDP offer:', offer)
    // Convert to the format expected by Phoenix signaling
    this.sendMessage({ 
      type: 'sdp_offer', 
      data: {
        type: offer.type,
        sdp: offer.sdp
      }
    })
  }

  private setupPeerConnectionHandlers(): void {
    if (!this.pc) return

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('Sent ICE candidate:', event.candidate)
        // Convert to the format expected by Phoenix signaling
        this.sendMessage({ 
          type: 'ice_candidate', 
          data: {
            candidate: event.candidate.candidate,
            sdpMLineIndex: event.candidate.sdpMLineIndex,
            sdpMid: event.candidate.sdpMid
          }
        })
      }
    }

    this.pc.onconnectionstatechange = () => {
      if (!this.pc) return
      
      const state = this.pc.connectionState
      console.log('Connection state changed:', state)
      
      switch (state) {
        case 'connected':
          console.log('WebRTC connection established successfully')
          this.updateConnectionState('connected')
          break
        case 'disconnected':
          console.warn('WebRTC connection disconnected')
          this.updateConnectionState('disconnected')
          break
        case 'failed':
          console.error('WebRTC connection failed')
          this.handleError(new Error(`Connection failed: ${state}`))
          break
        case 'closed':
          console.log('WebRTC connection closed')
          this.updateConnectionState('closed')
          break
        default:
          console.log('WebRTC connection state:', state)
      }
    }

    this.pc.oniceconnectionstatechange = () => {
      if (!this.pc) return
      console.log('ICE connection state:', this.pc.iceConnectionState)
    }

    this.pc.onicegatheringstatechange = () => {
      if (!this.pc) return
      console.log('ICE gathering state:', this.pc.iceGatheringState)
    }

    this.pc.ontrack = (event) => {
      console.log('Received track:', event.track.kind, event.track.readyState, event.track.enabled)
      
      if (this.remoteStream) {
        this.remoteStream.addTrack(event.track)
        this.callbacks.onRemoteStream?.(this.remoteStream)
        
      }
    }
  }

  private setupChannelHandlers(): void {
    if (!this.channel) return
    this.channel.on(this.signalingId, async (payload: any) => {
      console.log('Received signaling message:', payload)
      const { type, data } = payload

      switch (type) {
        case 'sdp_answer':
          console.log('Received SDP answer:', data)
          if (this.pc && data) {
            // Convert from Phoenix signaling format to WebRTC format
            const answer = new RTCSessionDescription({
              type: 'answer',
              sdp: data.sdp || data
            })
            await this.pc.setRemoteDescription(answer)
          }
          break
          
        case 'sdp_offer':
          console.log('Received SDP offer:', data)
          if (this.pc && data) {
            // Convert from Phoenix signaling format to WebRTC format
            const offer = new RTCSessionDescription({
              type: 'offer',
              sdp: data.sdp || data
            })
            await this.pc.setRemoteDescription(offer)
            const answer = await this.pc.createAnswer()
            await this.pc.setLocalDescription(answer)
            // Send answer in the format expected by Phoenix signaling
            this.sendMessage({ 
              type: 'sdp_answer', 
              data: {
                type: answer.type,
                sdp: answer.sdp
              }
            })
            console.log('Sent SDP answer:', answer)
          }
          break
          
        case 'ice_candidate':
          console.log('Received ICE candidate:', data)
          if (this.pc && data) {
            // Convert from Phoenix signaling format to WebRTC format
            const candidate = new RTCIceCandidate({
              candidate: data.candidate,
              sdpMLineIndex: data.sdpMLineIndex,
              sdpMid: data.sdpMid
            })
            await this.pc.addIceCandidate(candidate)
          }
          break
          
        case 'asr_response':
          console.log('Received ASR response:', data)
          this.callbacks.onASRResponse?.(data.results || data)
          break
          
          
      }
    })
  }

  private sendMessage(message: SignalingMessage): void {
    if (!this.channel) {
      console.error('Channel not available')
      return
    }
    this.channel.push(this.signalingId, message)
  }

  private updateConnectionState(state: ConnectionState): void {
    this.callbacks.onConnectionStateChange?.(state)
  }

  private handleError(error: Error): void {
    console.error('WebRTC error:', error)
    this.callbacks.onError?.(error)
    this.updateConnectionState('failed')
  }

  disconnect(): void {
    // Stop local stream tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop())
      this.localStream = null
    }

    // Clear remote stream
    if (this.remoteStream) {
      this.remoteStream.getTracks().forEach(track => track.stop())
      this.remoteStream = null
    }

    // Close peer connection
    if (this.pc) {
      this.pc.close()
      this.pc = null
    }

    // Leave channel
    if (this.channel) {
      this.channel.leave()
      this.channel = null
    }

    // Disconnect socket
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
    }

    this.updateConnectionState('disconnected')
  }

  // Utility methods
  toggleAudio(enabled?: boolean): void {
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

  getLocalStream(): MediaStream | null {
    return this.localStream
  }

  getConnectionState(): RTCPeerConnectionState | null {
    return this.pc?.connectionState || null
  }
}