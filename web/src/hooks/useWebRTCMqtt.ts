import { useState, useEffect, useRef, useCallback } from 'react'
import mqtt, { type MqttClient as BaseMqttClient } from 'mqtt'
import { MqttWebRTCSignaling } from '@/services/mqtt-webrtc-signaling'
import { webrtcClientConfig } from '@/config/mqtt'
import type { ConnectionState, UseWebRTCOptions, UseWebRTCReturn } from '@/types/webrtc'
import { webrtcLogger, mqttLogger } from '@/utils/logger'

export interface UseWebRTCMqttOptions extends Omit<UseWebRTCOptions, 'signalingId'> {
  brokerUrl?: string
  username?: string
  password?: string
  clientId?: string
  autoConnect?: boolean
}

export function useWebRTCMqtt({
  brokerUrl,
  username,
  password,
  clientId,
  config = {},
  mediaConstraints = {
    video: true,
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: 48000,
      sampleSize: 16,
      channelCount: 2
    }
  },
  autoConnect = true,
  onASRResponse
}: UseWebRTCMqttOptions): UseWebRTCReturn & { mqttConnected: boolean } {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected')
  const [mqttConnected, setMqttConnected] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [isAudioEnabled, setIsAudioEnabled] = useState(true)
  const [isVideoEnabled, setIsVideoEnabled] = useState(true)
  
  const mqttClientRef = useRef<BaseMqttClient | null>(null)
  const signalingRef = useRef<MqttWebRTCSignaling | null>(null)
  const hasConnectedRef = useRef(false)

  const actualClientId = useRef(clientId || `webrtc_client_${Math.random().toString(36).substring(2, 10)}`).current

  const connectMqtt = useCallback(async (): Promise<void> => {
    const mqttConfig = {
      ...webrtcClientConfig,
      brokerUrl: brokerUrl || webrtcClientConfig.brokerUrl,
      username: username || webrtcClientConfig.username,
      password: password || webrtcClientConfig.password,
      clientId: actualClientId,
      clean: true
    }
    
    return new Promise((resolve, reject) => {
      mqttLogger.info(`📡 WebRTC: Connecting to MQTT broker at ${mqttConfig.brokerUrl} (ClientID: ${actualClientId})`)
      
      const client = mqtt.connect(mqttConfig.brokerUrl, {
        clientId: mqttConfig.clientId,
        username: mqttConfig.username,
        password: mqttConfig.password,
        clean: mqttConfig.clean,
        connectTimeout: mqttConfig.connectTimeout,
        reconnectPeriod: mqttConfig.reconnectPeriod,
        protocolVersion: mqttConfig.protocolVersion
      })

      client.on('connect', () => {
        mqttLogger.info(`✅ WebRTC: MQTT connected (ClientID: ${actualClientId})`)
        setMqttConnected(true)
        mqttClientRef.current = client
        resolve()
      })

      client.on('error', (err) => {
        mqttLogger.error('❌ WebRTC: MQTT connection error:', err.message)
        setError(err)
        reject(err)
      })

      client.on('disconnect', () => {
        mqttLogger.warn('🔌 WebRTC: MQTT disconnected')
        setMqttConnected(false)
      })

      client.on('reconnect', () => {
        mqttLogger.info('🔄 WebRTC: MQTT reconnecting...')
      })
    })
  }, [brokerUrl, actualClientId, username, password])

  const connect = useCallback(async () => {
    try {
      setError(null)
      
      // Connect MQTT if not connected
      if (!mqttClientRef.current || !mqttConnected) {
        webrtcLogger.info('🔗 WebRTC: Step 1/2 - Establishing MQTT connection')
        await connectMqtt()
      }

      webrtcLogger.info('🎥 WebRTC: Step 2/2 - Starting WebRTC signaling')
      setConnectionState('connecting')
      
      if (signalingRef.current) {
        signalingRef.current.disconnect()
      }

      signalingRef.current = new MqttWebRTCSignaling({
        mqttClient: mqttClientRef.current,
        clientId: actualClientId,
        config,
        mediaConstraints,
        callbacks: {
          onConnectionStateChange: setConnectionState,
          onLocalStream: setLocalStream,
          onRemoteStream: setRemoteStream,
          onError: setError,
          onASRResponse: onASRResponse
        }
      })

      await signalingRef.current.connect()
      webrtcLogger.info('✅ WebRTC: Connection established')
    } catch (err) {
      webrtcLogger.error('❌ WebRTC: Failed to connect:', err)
      setError(err as Error)
      setConnectionState('failed')
    }
  }, [actualClientId, config, mediaConstraints, onASRResponse, mqttConnected, connectMqtt])

  const disconnect = useCallback(() => {
    webrtcLogger.info('🔌 WebRTC: Manual disconnect initiated')
    
    try {
      // Disconnect WebRTC signaling
      if (signalingRef.current) {
        webrtcLogger.info('🔌 Stopping WebRTC signaling...')
        signalingRef.current.disconnect()
        signalingRef.current = null
      }
      
      // Stop local media streams
      if (localStream) {
        webrtcLogger.info('🎥 Stopping local media streams...')
        localStream.getTracks().forEach(track => {
          track.stop()
          webrtcLogger.info(`🔇 Stopped ${track.kind} track`)
        })
      }
      
      // Stop remote media streams
      if (remoteStream) {
        webrtcLogger.info('📺 Stopping remote media streams...')
        remoteStream.getTracks().forEach(track => track.stop())
      }
      
      // Disconnect MQTT client
      if (mqttClientRef.current && mqttClientRef.current.connected) {
        webrtcLogger.info('🔌 Disconnecting MQTT client...')
        mqttClientRef.current.end(true) // Force close
        mqttClientRef.current = null
      }
      
      // Reset all state
      setMqttConnected(false)
      setConnectionState('disconnected')
      setLocalStream(null)
      setRemoteStream(null)
      setError(null)
      hasConnectedRef.current = false
      
      webrtcLogger.info('✅ WebRTC: Disconnect completed')
    } catch (error) {
      webrtcLogger.error('❌ Error during disconnect:', error)
    }
  }, [localStream, remoteStream])

  const toggleAudio = useCallback(async (enabled?: boolean) => {
    const shouldEnable = enabled !== undefined ? enabled : !isAudioEnabled
    
    if (shouldEnable) {
      // If enabling and not connected, reconnect
      if (!isAudioEnabled && connectionState !== 'connected') {
        webrtcLogger.info('🎤 Reconnecting for audio...')
        await connect()
      } else if (signalingRef.current) {
        signalingRef.current.toggleAudio(true)
      }
      setIsAudioEnabled(true)
    } else {
      // If disabling, disconnect the connection
      webrtcLogger.info('🎤 Disconnecting audio...')
      disconnect()
      setIsAudioEnabled(false)
    }
  }, [isAudioEnabled, connectionState, connect, disconnect])

  const toggleVideo = useCallback(async (enabled?: boolean) => {
    const shouldEnable = enabled !== undefined ? enabled : !isVideoEnabled
    
    if (shouldEnable) {
      // If enabling and not connected, reconnect  
      if (!isVideoEnabled && connectionState !== 'connected') {
        webrtcLogger.info('🎥 Reconnecting for video...')
        await connect()
      } else if (signalingRef.current) {
        signalingRef.current.toggleVideo(true)
      }
      setIsVideoEnabled(true)
    } else {
      // If disabling, disconnect the connection
      webrtcLogger.info('🎥 Disconnecting video...')
      disconnect()
      setIsVideoEnabled(false)
    }
  }, [isVideoEnabled, connectionState, connect, disconnect])

  useEffect(() => {
    if (autoConnect && !hasConnectedRef.current) {
      hasConnectedRef.current = true
      webrtcLogger.info('🎯 WebRTC: Auto-connecting')
      connect()
    }

    return () => {
      webrtcLogger.info('🧹 Cleaning up WebRTC connections...')
      
      if (signalingRef.current) {
        webrtcLogger.info('🔌 Disconnecting WebRTC signaling')
        signalingRef.current.disconnect()
        signalingRef.current = null
      }
      
      if (mqttClientRef.current) {
        webrtcLogger.info('🔌 Disconnecting MQTT client')
        mqttClientRef.current.end()
        mqttClientRef.current = null
      }
      
      setMqttConnected(false)
      setConnectionState('disconnected')
      setLocalStream(null)
      setRemoteStream(null)
      hasConnectedRef.current = false
      
      webrtcLogger.info('✅ WebRTC cleanup completed')
    }
  }, [autoConnect])

  return {
    localStream,
    remoteStream,
    connectionState,
    mqttConnected,
    isConnecting: connectionState === 'connecting',
    isConnected: connectionState === 'connected',
    error,
    connect,
    disconnect,
    toggleAudio,
    toggleVideo,
    isAudioEnabled,
    isVideoEnabled
  }
}