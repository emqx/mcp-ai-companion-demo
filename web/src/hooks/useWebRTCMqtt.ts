import { useState, useRef, useCallback } from 'react'
import { type MqttClient as BaseMqttClient } from 'mqtt'
import { MqttWebRTCSignaling } from '@/services/mqtt-webrtc-signaling'
import type { ConnectionState, UseWebRTCOptions, UseWebRTCReturn } from '@/types/webrtc'
import { webrtcLogger } from '@/utils/logger'

export interface UseWebRTCMqttOptions extends Omit<UseWebRTCOptions, 'signalingId'> {
  mqttClient?: BaseMqttClient | null // Accept external MQTT client
}

export function useWebRTCMqtt({
  mqttClient: externalMqttClient,
  config = {},
  mediaConstraints = {
    video: true,
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: 48000,
      sampleSize: 16,
      channelCount: 2,
    },
  },
  onASRResponse,
  onTTSText,
}: UseWebRTCMqttOptions): UseWebRTCReturn {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected')
  const [error, setError] = useState<Error | null>(null)
  const [isAudioEnabled, setIsAudioEnabled] = useState(true)
  const [isVideoEnabled, setIsVideoEnabled] = useState(true)

  const mqttClientRef = useRef<BaseMqttClient | null | undefined>(externalMqttClient)
  const signalingRef = useRef<MqttWebRTCSignaling | null>(null)

  // Update MQTT client ref when external client changes
  mqttClientRef.current = externalMqttClient || null

  const connect = useCallback(async () => {
    try {
      setError(null)

      // Check if MQTT client is provided and connected
      if (!mqttClientRef.current) {
        throw new Error('MQTT client not provided. WebRTC requires the MCP MQTT client to be connected first.')
      }

      if (!mqttClientRef.current.connected) {
        throw new Error('MQTT client is not connected. Please ensure MCP is connected first.')
      }

      webrtcLogger.info('🎥 WebRTC: Starting WebRTC signaling with shared MQTT client')
      setConnectionState('connecting')

      if (signalingRef.current) {
        signalingRef.current.disconnect()
      }

      // Get client ID from the MQTT client's clientId property
      const clientId = (mqttClientRef.current as any).options?.clientId
      if (!clientId) {
        throw new Error('Cannot get client ID from MQTT client')
      }

      signalingRef.current = new MqttWebRTCSignaling({
        mqttClient: mqttClientRef.current,
        clientId,
        config,
        mediaConstraints,
        callbacks: {
          onConnectionStateChange: setConnectionState,
          onLocalStream: setLocalStream,
          onRemoteStream: setRemoteStream,
          onError: setError,
          onASRResponse: onASRResponse,
          onTTSText: onTTSText,
        },
      })

      await signalingRef.current.connect()
      webrtcLogger.info('✅ WebRTC: Connection established with shared MQTT client')
    } catch (err) {
      webrtcLogger.error('❌ WebRTC: Failed to connect:', err)
      setError(err as Error)
      setConnectionState('failed')
    }
  }, [config, mediaConstraints, onASRResponse, onTTSText])

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
        localStream.getTracks().forEach((track) => {
          track.stop()
          webrtcLogger.info(`🔇 Stopped ${track.kind} track`)
        })
      }

      // Stop remote media streams
      if (remoteStream) {
        webrtcLogger.info('📺 Stopping remote media streams...')
        remoteStream.getTracks().forEach((track) => track.stop())
      }

      // Don't disconnect the MQTT client since it's shared with MCP
      // Just reset WebRTC state
      setConnectionState('disconnected')
      setLocalStream(null)
      setRemoteStream(null)
      setError(null)

      webrtcLogger.info('✅ WebRTC: Disconnect completed')
    } catch (error) {
      webrtcLogger.error('❌ Error during disconnect:', error)
    }
  }, [localStream, remoteStream])

  const toggleAudio = useCallback(
    async (enabled?: boolean) => {
      const shouldEnable = enabled !== undefined ? enabled : !isAudioEnabled

      if (shouldEnable) {
        // If enabling and not connected, reconnect
        if (!isAudioEnabled && connectionState !== 'connected') {
          webrtcLogger.info('🎤 Reconnecting for audio...')
          await connect()
        } else if (signalingRef.current) {
          webrtcLogger.info('🎤 Enabling audio...')
          signalingRef.current.toggleAudio(true)
        }
        setIsAudioEnabled(true)
      } else {
        // If disabling, just mute the audio tracks without disconnecting
        if (signalingRef.current) {
          webrtcLogger.info('🎤 Muting audio...')
          signalingRef.current.toggleAudio(false)
        }
        setIsAudioEnabled(false)
      }
    },
    [isAudioEnabled, connectionState, connect],
  )

  const toggleVideo = useCallback(
    async (enabled?: boolean) => {
      const shouldEnable = enabled !== undefined ? enabled : !isVideoEnabled

      if (shouldEnable) {
        // If enabling and not connected, reconnect
        if (!isVideoEnabled && connectionState !== 'connected') {
          webrtcLogger.info('🎥 Reconnecting for video...')
          await connect()
        } else if (signalingRef.current) {
          webrtcLogger.info('🎥 Enabling video...')
          signalingRef.current.toggleVideo(true)
        }
        setIsVideoEnabled(true)
      } else {
        // If disabling, just mute the video tracks without disconnecting
        if (signalingRef.current) {
          webrtcLogger.info('🎥 Muting video...')
          signalingRef.current.toggleVideo(false)
        }
        setIsVideoEnabled(false)
      }
    },
    [isVideoEnabled, connectionState, connect],
  )

  // Cleanup on unmount
  const cleanup = useCallback(() => {
    webrtcLogger.info('🧹 Cleaning up WebRTC connections...')

    if (signalingRef.current) {
      webrtcLogger.info('🔌 Disconnecting WebRTC signaling')
      signalingRef.current.disconnect()
      signalingRef.current = null
    }

    // Don't disconnect MQTT client since it's shared
    setConnectionState('disconnected')
    setLocalStream(null)
    setRemoteStream(null)

    webrtcLogger.info('✅ WebRTC cleanup completed')
  }, [])

  return {
    localStream,
    remoteStream,
    connectionState,
    isConnecting: connectionState === 'connecting',
    isConnected: connectionState === 'connected',
    error,
    connect,
    disconnect,
    toggleAudio,
    toggleVideo,
    isAudioEnabled,
    isVideoEnabled,
    cleanup,
  }
}
