import { useState, useEffect, useRef, useCallback } from 'react'
import { WebRTCSignaling } from '@/services/webrtc-signaling'
import type { ConnectionState, WebRTCConfig, MediaConstraints } from '@/types/webrtc'

interface UseWebRTCOptions {
  signalingId: string
  config?: Partial<WebRTCConfig>
  mediaConstraints?: Partial<MediaConstraints>
  autoConnect?: boolean
}

interface UseWebRTCReturn {
  localStream: MediaStream | null
  remoteStream: MediaStream | null
  connectionState: ConnectionState
  isConnecting: boolean
  isConnected: boolean
  error: Error | null
  connect: () => Promise<void>
  disconnect: () => void
  toggleAudio: (enabled?: boolean) => void
  toggleVideo: (enabled?: boolean) => void
  isAudioEnabled: boolean
  isVideoEnabled: boolean
}

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
      channelCount: 2
    }
  },
  autoConnect = false
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
 
      signalingRef.current = new WebRTCSignaling(
        signalingId,
        config,
        mediaConstraints,
        {
          onConnectionStateChange: setConnectionState,
          onLocalStream: setLocalStream,
          onRemoteStream: setRemoteStream,
          onError: setError
        }
      )

      await signalingRef.current.connect()
    } catch (err) {
      setError(err as Error)
      setConnectionState('failed')
    }
  }, [signalingId, config, mediaConstraints])

  const disconnect = useCallback(() => {
    if (signalingRef.current) {
      signalingRef.current.disconnect()
      signalingRef.current = null
    }
    setLocalStream(null)
    setRemoteStream(null)
    setConnectionState('disconnected')
  }, [])

  const toggleAudio = useCallback((enabled?: boolean) => {
    if (signalingRef.current) {
      signalingRef.current.toggleAudio(enabled)
      setIsAudioEnabled(enabled !== undefined ? enabled : !isAudioEnabled)
    }
  }, [isAudioEnabled])

  const toggleVideo = useCallback((enabled?: boolean) => {
    if (signalingRef.current) {
      signalingRef.current.toggleVideo(enabled)
      setIsVideoEnabled(enabled !== undefined ? enabled : !isVideoEnabled)
    }
  }, [isVideoEnabled])

  useEffect(() => {
    if (autoConnect) {
      connect()
    }

    return () => {
      if (signalingRef.current) {
        signalingRef.current.disconnect()
      }
    }
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
    isVideoEnabled
  }
}