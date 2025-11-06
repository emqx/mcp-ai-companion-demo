import { useState, useRef, useCallback, useEffect } from 'react'
import { rtcClient, type BasicInfo, AnsMode } from '@/lib/rtcClient'
import type { UseWebRTCReturn, ConnectionState } from '@/types/webrtc'
import type { UseWebRTCMqttOptions } from '@/hooks/useWebRTCMqtt'
import { fetchScenes, startVoiceChat, stopVoiceChat } from '@/api/aigc'
import type { SceneSummary } from '@/types/aigc'
import { parseAigcBinaryMessage, MESSAGE_TYPE, AGENT_BRIEF_CODE } from '@/utils/aigcMessages'
import { MediaType } from '@volcengine/rtc'

export interface UseVolcRtcOptions extends Pick<UseWebRTCMqttOptions, 'onASRResponse' | 'onTTSText' | 'onMessage'> {
  sceneId?: string
  deviceId?: string
}

const stageToLoadingStatus = (code?: number) => {
  switch (code) {
    case AGENT_BRIEF_CODE.LISTENING:
      return 'listening'
    case AGENT_BRIEF_CODE.THINKING:
      return 'processing'
    case AGENT_BRIEF_CODE.SPEAKING:
    case AGENT_BRIEF_CODE.FINISHED:
    case AGENT_BRIEF_CODE.INTERRUPTED:
      return 'complete'
    default:
      return undefined
  }
}

export function useVolcRtc({ sceneId, deviceId, onASRResponse, onTTSText, onMessage }: UseVolcRtcOptions): UseWebRTCReturn {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected')
  const [error, setError] = useState<Error | null>(null)
  const [isAudioEnabled, setIsAudioEnabled] = useState(true)
  const [isVideoEnabled, setIsVideoEnabled] = useState(false)

  const sceneRef = useRef<SceneSummary | null>(null)
  const basicInfoRef = useRef<BasicInfo | null>(null)
  const remoteUserIdRef = useRef<string | null>(null)
  const voiceChatStartedRef = useRef(false)
  const pendingConnectRef = useRef(false)

  useEffect(() => {
    rtcClient.setAiAnsMode(AnsMode.MEDIUM)
    rtcClient.setAiAnsEnabled(true)
  }, [])

  const updateRemoteStream = useCallback(
    (userId?: string) => {
      const targetUser = userId ?? remoteUserIdRef.current
      if (!targetUser) return

      const stream = rtcClient.getRemoteMediaStream(targetUser)
      if (stream && stream.getTracks().length > 0) {
        setRemoteStream(stream)
      }
    },
    [],
  )

  const ensureSceneConfig = useCallback(async () => {
    if (sceneRef.current) {
      return sceneRef.current
    }
    const { result } = await fetchScenes()
    const scenes = result.scenes || []
    if (!scenes.length) {
      throw new Error('No Volc scenes available')
    }

    const selected =
      scenes.find((item) => item.scene.id === sceneId) ||
      scenes.find((item) => item.scene.id === result.scenes[0]?.scene.id) ||
      scenes[0]
    sceneRef.current = selected
    return selected
  }, [sceneId])

  const tryUpdateLocalStream = useCallback(() => {
    const stream = rtcClient.getLocalMediaStream()
    if (stream) {
      setLocalStream(stream)
      return true
    }
    return false
  }, [])

  const refreshLocalStream = useCallback(
    (attempt = 0) => {
      if (tryUpdateLocalStream()) {
        return
      }
      if (attempt >= 3) {
        return
      }
      window.setTimeout(() => {
        refreshLocalStream(attempt + 1)
      }, 200)
    },
    [tryUpdateLocalStream],
  )

  const handleBinaryMessage = useCallback((buffer: ArrayBuffer) => {
      const parsed = parseAigcBinaryMessage(buffer)
      if (!parsed) return

      switch (parsed.type) {
        case MESSAGE_TYPE.SUBTITLE: {
          const entries = parsed.payload.data || []
          for (const entry of entries) {
            if (!entry?.text) continue
            const scene = sceneRef.current
            const botId = scene?.scene.botName
            const localUserId = basicInfoRef.current?.userId
            const target = entry.userId || entry.role

            if (target === botId || entry.role === 'assistant') {
              onTTSText?.(entry.text)
            } else if (target === localUserId || entry.role === 'user') {
              onASRResponse?.(entry.text)
            }
          }
          break
        }
        case MESSAGE_TYPE.BRIEF: {
          const stage = parsed.payload.Stage
          const errorInfo = parsed.payload.ErrorInfo
          const status = stageToLoadingStatus(stage?.Code)
          if (status) {
            onMessage?.({
              type: 'loading',
              status,
            } as any)
          }
          const hasError =
            stage?.Description === 'errorOccurred' ||
            stage?.Code === AGENT_BRIEF_CODE.UNKNOWN ||
            Boolean(errorInfo)
          if (hasError) {
            const reason =
              (typeof errorInfo?.Reason === 'string' && errorInfo.Reason) ||
              (errorInfo ? JSON.stringify(errorInfo) : stage?.Description || 'Unknown error')
            const code = (errorInfo as Record<string, unknown>)?.ErrorCode ?? stage?.Code ?? -1
            const err = new Error(reason)
            setError(err)
            onMessage?.({
              type: 'error',
              reason,
              code,
            } as any)
          }
          break
        }
        case MESSAGE_TYPE.FUNCTION_CALL:
          // No-op for now
          break
        default:
          break
      }
    },
    [onASRResponse, onMessage, onTTSText],
  )

  useEffect(() => {
    rtcClient.setListeners({
      onError: (evt) => {
        setError(new Error(`RTC error: ${evt.errorCode}`))
        setConnectionState('failed')
      },
      onUserPublishStream: async (event) => {
        const localUserId = basicInfoRef.current?.userId
        if (!event || !event.userId || event.userId === localUserId) {
          return
        }
        remoteUserIdRef.current = event.userId
        try {
          if (event.mediaType === MediaType.AUDIO_AND_VIDEO) {
            await rtcClient.subscribeStream(event.userId, MediaType.AUDIO)
            await rtcClient.subscribeStream(event.userId, MediaType.VIDEO)
          } else {
            await rtcClient.subscribeStream(event.userId, event.mediaType)
          }
          updateRemoteStream(event.userId)
        } catch (err) {
          setError(err as Error)
        }
      },
      onUserPublishScreen: async (event) => {
        const localUserId = basicInfoRef.current?.userId
        if (!event || !event.userId || event.userId === localUserId) {
          return
        }
        remoteUserIdRef.current = event.userId
        try {
          await rtcClient.subscribeScreen(event.userId, event.mediaType)
          updateRemoteStream(event.userId)
        } catch (err) {
          setError(err as Error)
        }
      },
      onUserUnpublishStream: (event) => {
        if (!event || event.userId !== remoteUserIdRef.current) {
          return
        }
        setRemoteStream(null)
      },
      onUserUnpublishScreen: (event) => {
        if (!event || event.userId !== remoteUserIdRef.current) {
          return
        }
        setRemoteStream(null)
      },
      onUserLeave: (event) => {
        const leavingUserId = event?.userInfo?.userId
        if (leavingUserId && leavingUserId === remoteUserIdRef.current) {
          remoteUserIdRef.current = null
          setRemoteStream(null)
        }
      },
      onRoomBinaryMessage: ({ message }) => {
        handleBinaryMessage(message)
      },
    })

    return () => {
      rtcClient.setListeners({})
    }
  }, [handleBinaryMessage, updateRemoteStream])

  const connect = useCallback(async () => {
    if (pendingConnectRef.current || connectionState === 'connected') {
      return
    }
    pendingConnectRef.current = true
    setError(null)
    setConnectionState('connecting')

    try {
      if (!deviceId) {
        throw new Error('Device ID unavailable. Please ensure MCP MQTT is connected.')
      }

      const scene = await ensureSceneConfig()
      const { rtc, scene: sceneConfig } = scene
      if (!rtc?.AppId || !rtc.RoomId || !rtc.UserId || !rtc.Token) {
        throw new Error('Incomplete RTC configuration from Volc server')
      }

      const basic: BasicInfo = {
        appId: rtc.AppId,
        roomId: rtc.RoomId,
        userId: rtc.UserId,
        token: rtc.Token,
      }
      rtcClient.setBasicInfo(basic)
      basicInfoRef.current = basic

      await rtcClient.joinRoom(basic)
      setConnectionState('connected')

      if (isAudioEnabled) {
        await rtcClient.startAudioCapture()
        await rtcClient.publishStream(MediaType.AUDIO)
      }
      if (isVideoEnabled) {
        try {
          await rtcClient.startVideoCapture()
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          // Ignore SDK errors thrown when the capture session is already active
          if (!message.includes('Has already capture')) {
            throw err
          }
        }
        await rtcClient.publishStream(MediaType.VIDEO)
        refreshLocalStream()
      }

      if (sceneConfig?.id && !voiceChatStartedRef.current) {
        try {
          await startVoiceChat(sceneConfig.id, {
            device_id: deviceId,
          })
          voiceChatStartedRef.current = true
        } catch (e) {
          console.warn('[useVolcRtc] Failed to start voice chat', e)
        }
      }
    } catch (err) {
      setError(err as Error)
      setConnectionState('failed')
    } finally {
      pendingConnectRef.current = false
    }
  }, [connectionState, deviceId, ensureSceneConfig, isAudioEnabled, isVideoEnabled, refreshLocalStream])

  const disconnect = useCallback(async () => {
    pendingConnectRef.current = false
    const scene = sceneRef.current
    if (voiceChatStartedRef.current && scene?.scene.id) {
      try {
        await stopVoiceChat(scene.scene.id)
      } catch (error) {
        console.warn('[useVolcRtc] Failed to stop voice chat', error)
      } finally {
        voiceChatStartedRef.current = false
      }
    }

    try {
      await rtcClient.unpublishStream(MediaType.VIDEO)
    } catch (err) {
      console.warn('[useVolcRtc] unpublish video failed', err)
    }
    setLocalStream(null)
    try {
      await rtcClient.unpublishStream(MediaType.AUDIO)
    } catch (err) {
      console.warn('[useVolcRtc] unpublish audio failed', err)
    }
    try {
      await rtcClient.stopVideoCapture()
    } catch (err) {
      console.warn('[useVolcRtc] stop video capture failed', err)
    }
    try {
      await rtcClient.stopAudioCapture()
    } catch (err) {
      console.warn('[useVolcRtc] stop audio capture failed', err)
    }

    await rtcClient.leaveRoom()
    setRemoteStream(null)
    setConnectionState('disconnected')
  }, [])

  const toggleAudio = useCallback(
    async (enabled?: boolean) => {
      const shouldEnable = enabled ?? !isAudioEnabled
      if (shouldEnable === isAudioEnabled) {
        return
      }

      if (shouldEnable) {
        setIsAudioEnabled(true)
        if (connectionState !== 'connected') {
          await connect()
          return
        }
        await rtcClient.startAudioCapture()
        await rtcClient.publishStream(MediaType.AUDIO)
      } else {
        await rtcClient.unpublishStream(MediaType.AUDIO)
        await rtcClient.stopAudioCapture()
        setIsAudioEnabled(false)
      }
    },
    [connect, connectionState, isAudioEnabled],
  )

  const toggleVideo = useCallback(
    async (enabled?: boolean) => {
      const shouldEnable = enabled ?? !isVideoEnabled
      if (shouldEnable === isVideoEnabled) {
        return
      }

      if (shouldEnable) {
        setIsVideoEnabled(true)
        if (connectionState !== 'connected') {
          await connect()
        }
        try {
          await rtcClient.startVideoCapture()
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          if (!message.includes('Has already capture')) {
            throw err
          }
        }
        await rtcClient.publishStream(MediaType.VIDEO)
        refreshLocalStream()
      } else {
        await rtcClient.unpublishStream(MediaType.VIDEO)
        await rtcClient.stopVideoCapture()
        setIsVideoEnabled(false)
        setLocalStream(null)
      }
    },
    [connect, connectionState, isVideoEnabled, refreshLocalStream],
  )

  useEffect(() => {
    const shouldDisconnect = () =>
      voiceChatStartedRef.current || connectionState === 'connected' || connectionState === 'connecting'

    const handleBeforeUnload = () => {
      if (shouldDisconnect()) {
        void disconnect()
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [connectionState, disconnect])

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
    cleanup: disconnect,
  }
}
