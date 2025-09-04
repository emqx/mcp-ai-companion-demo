import { useState, useEffect, useRef, useCallback } from 'react'
import { WebRTCSignaling } from '@/services/webrtc-signaling'
import type { ConnectionState, UseWebRTCOptions, UseWebRTCReturn } from '@/types/webrtc'

export function useWebRTC({
  signalingId,
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
  autoConnect = false,
  onASRResponse,
}: UseWebRTCOptions): UseWebRTCReturn {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected')
  const [error, setError] = useState<Error | null>(null)
  const [isAudioEnabled, setIsAudioEnabled] = useState(true)
  const [isVideoEnabled, setIsVideoEnabled] = useState(true)

  const signalingRef = useRef<WebRTCSignaling | null>(null)

  const connect = useCallback(async () => {
    try {
      setError(null)
      setConnectionState('connecting')

      if (signalingRef.current) {
        signalingRef.current.disconnect()
      }

      signalingRef.current = new WebRTCSignaling(signalingId, config, mediaConstraints, {
        onConnectionStateChange: setConnectionState,
        onLocalStream: setLocalStream,
        onRemoteStream: setRemoteStream,
        onError: setError,
        onASRResponse: onASRResponse,
      })

      await signalingRef.current.connect()
    } catch (err) {
      setError(err as Error)
      setConnectionState('failed')
    }
  }, [signalingId, config, mediaConstraints, onASRResponse])

  const disconnect = useCallback(() => {
    if (signalingRef.current) {
      signalingRef.current.disconnect()
      signalingRef.current = null
    }
    setLocalStream(null)
    setRemoteStream(null)
    setConnectionState('disconnected')
  }, [])

  const toggleAudio = useCallback(
    async (enabled?: boolean) => {
      if (signalingRef.current) {
        await signalingRef.current.toggleAudio(enabled)
        setIsAudioEnabled(enabled !== undefined ? enabled : !isAudioEnabled)
      }
    },
    [isAudioEnabled],
  )

  const toggleVideo = useCallback(
    async (enabled?: boolean) => {
      if (signalingRef.current) {
        await signalingRef.current.toggleVideo(enabled)
        setIsVideoEnabled(enabled !== undefined ? enabled : !isVideoEnabled)
      }
    },
    [isVideoEnabled],
  )

  useEffect(() => {
    if (autoConnect) {
      connect()
    }

    return () => {
      if (signalingRef.current) {
        signalingRef.current.disconnect()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConnect])

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
  }
}
