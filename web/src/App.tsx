import { useMcpMqttServer } from '@/hooks/useMcpMqttServer'
import { useVolcRtc } from '@/hooks/useVolcRtc'
import { usePhotoCapture } from '@/hooks/usePhotoCapture'
import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { ChatInterface } from '@/components/ChatInterface'
import { Settings } from '@/components/Settings'
import { appLogger, conversationLogger } from '@/utils/logger'
import { Toaster } from '@/components/ui/sonner'
import { toast } from 'sonner'
import { defaultMqttConfig } from '@/config/mqtt'
import { loadMqttConfig, saveMqttConfig, type MqttConfig } from '@/utils/storage'
import type { PhotoCaptureResult } from '@/tools/types'

function App() {
  const { t } = useTranslation()
  const [aiReplyText, setAiReplyText] = useState<string>('')
  const [llmLoading, setLlmLoading] = useState<'processing' | 'waiting' | 'listening' | null>(null)
  const [showVideo, setShowVideo] = useState<boolean>(false)
  const [selectedEmotion, setSelectedEmotion] = useState<string>('happy')
  const [volume, setVolume] = useState<number>(1.0) // 0.0 to 1.0
  const [isMuted, setIsMuted] = useState<boolean>(true)
  const [mqttConfig, setMqttConfig] = useState<MqttConfig>(() => {
    const savedConfig = loadMqttConfig()
    if (savedConfig) {
      return savedConfig
    }
    return {
      brokerUrl: defaultMqttConfig.brokerUrl,
      username: defaultMqttConfig.username,
      password: defaultMqttConfig.password,
      connectTimeout: defaultMqttConfig.connectTimeout,
      reconnectPeriod: defaultMqttConfig.reconnectPeriod,
    }
  })
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const closePreviewTimeoutRef = useRef<number | null>(null)
  const onCameraControl = useCallback((enabled: boolean) => {
    appLogger.info(`📷 Camera control: ${enabled ? 'ON' : 'OFF'}`)
    setShowVideo(enabled)
  }, [])

  const onEmotionChange = useCallback((emotion: string) => {
    appLogger.info(`😊 Emotion changed: ${emotion}`)
    setSelectedEmotion(emotion)
  }, [])

  const { captureFromLocalCamera } = usePhotoCapture()

  // Photo capture function that always uses local camera
  const onTakePhoto = useCallback(
    async (source: 'local' | 'remote' = 'local', quality: number): Promise<PhotoCaptureResult> => {
      appLogger.info(`📸 Taking photo with local camera, source=${source}, quality=${quality}`)
      const result = await captureFromLocalCamera(quality)

      if (closePreviewTimeoutRef.current) {
        clearTimeout(closePreviewTimeoutRef.current)
      }
      closePreviewTimeoutRef.current = window.setTimeout(() => {
        setShowVideo(false)
        appLogger.info('📷 Photo capture timeout reached, camera preview disabled')
        closePreviewTimeoutRef.current = null
      }, 1500)
      appLogger.info('📷 Photo captured, camera preview will close in 1.5 seconds')
      return result
    },
    [captureFromLocalCamera],
  )

  const onVolumeControl = useCallback(
    (newVolume?: number, muted?: boolean) => {
      if (newVolume !== undefined) {
        setVolume(newVolume)
        const volumePercent = Math.round(newVolume * 100)
        appLogger.info(`🔊 Volume set to ${volumePercent}%`)
        toast(`${t('audio.volumeSet')} ${volumePercent}%`, {
          duration: 3000,
        })
      }

      if (muted !== undefined) {
        setIsMuted(muted)
        const message = muted ? t('audio.muted') : t('audio.unmuted')
        appLogger.info(`🔊 Audio ${muted ? 'muted' : 'unmuted'}`)
        toast(message, {
          duration: 3000,
        })
      }

      if (audioRef.current) {
        if (newVolume !== undefined) {
          audioRef.current.volume = newVolume
        }
        if (muted !== undefined) {
          audioRef.current.muted = muted
        }
      }
    },
    [t],
  )

  const callbacks = useMemo(
    () => ({
      onCameraControl,
      onEmotionChange,
      onTakePhoto,
      onVolumeControl,
    }),
    [onCameraControl, onEmotionChange, onTakePhoto, onVolumeControl],
  )

  const handleMqttConfigChange = useCallback((config: MqttConfig) => {
    setMqttConfig(config)
    saveMqttConfig(config)
  }, [])

  const {
    client: mcpClient,
    isConnected: isMqttConnected,
    isMcpInitialized,
  } = useMcpMqttServer({
    brokerUrl: mqttConfig.brokerUrl,
    username: mqttConfig.username,
    password: mqttConfig.password,
    autoConnect: true,
    callbacks,
  })

  const deviceId = useMemo(() => mcpClient?.getServerName?.(), [mcpClient])

  const {
    localStream,
    remoteStream,
    isConnecting: isWebRTCConnecting,
    isConnected: isWebRTCConnected,
    error: webRTCError,
    connect: connectWebRTC,
    disconnect: disconnectWebRTC,
    toggleAudio,
    toggleVideo,
    isAudioEnabled,
    isVideoEnabled,
    cleanup: cleanupWebRTC,
  } = useVolcRtc({
    deviceId,
    onASRResponse: (text?: string) => {
      conversationLogger.user(text)
      setLlmLoading('processing')
      setAiReplyText('')
    },
    onTTSText: (text: string) => {
      // conversationLogger.assistant(text)
      setAiReplyText(text)
      setLlmLoading(null)
    },
    onMessage: (message: any) => {
      appLogger.debug('🔄 Conversation status update', message)
      if (message && typeof message === 'object') {
        if (message.type === 'loading') {
          if (message.status === 'processing' || message.status === 'waiting' || message.status === 'listening') {
            setLlmLoading(message.status)
            setAiReplyText('')
          } else if (message.status === 'complete') {
            setLlmLoading(null)
          }
        } else if (message.type === 'error') {
          const reason = message.reason || t('common.errorOccurred')
          toast.error(reason)
          setAiReplyText('')
          setLlmLoading(null)
        }
      }
    },
  })

  useEffect(() => {
    if (showVideo === isVideoEnabled) {
      return
    }
    const syncVideoState = async () => {
      try {
        await toggleVideo(showVideo)
      } catch (error) {
        appLogger.error('🎥 Failed to sync video state with camera control', error)
        setShowVideo(isVideoEnabled)
      }
    }
    void syncVideoState()
  }, [showVideo, isVideoEnabled, toggleVideo])

  useEffect(() => {
    if (isMqttConnected && isMcpInitialized) {
      appLogger.info('🚀 MCP Server ready to receive commands')
    }
  }, [isMqttConnected, isMcpInitialized])

  useEffect(() => {
    if (isWebRTCConnected) {
      appLogger.info('🎥 WebRTC connected successfully')
    }
  }, [isWebRTCConnected])

  useEffect(() => {
    if (!isWebRTCConnected) {
      setLlmLoading(null)
    }
  }, [isWebRTCConnected])

  // Cleanup WebRTC when component unmounts

  useEffect(() => {
    return () => {
      if (cleanupWebRTC) {
        void cleanupWebRTC()
      }
      if (closePreviewTimeoutRef.current) {
        clearTimeout(closePreviewTimeoutRef.current)
      }
    }
  }, [cleanupWebRTC])

  useEffect(() => {
    if (showVideo && closePreviewTimeoutRef.current) {
      clearTimeout(closePreviewTimeoutRef.current)
      closePreviewTimeoutRef.current = null
    }
  }, [showVideo])

  return (
    <>
      <ChatInterface
        webrtc={{
          localStream,
          remoteStream,
          isConnecting: isWebRTCConnecting,
          isConnected: isWebRTCConnected,
          error: webRTCError,
          isAudioEnabled,
          isVideoEnabled,
          connect: connectWebRTC,
          disconnect: disconnectWebRTC,
          toggleAudio,
          toggleVideo,
        }}
        aiReplyText={aiReplyText}
        llmLoading={llmLoading}
        showVideo={showVideo}
        setShowVideo={setShowVideo}
        selectedEmotion={selectedEmotion}
        setSelectedEmotion={setSelectedEmotion}
        setIsMuted={setIsMuted}
        videoRef={videoRef}
        audioRef={audioRef}
        volume={volume}
        isMuted={isMuted}
        settingsSlot={
          <Settings config={mqttConfig} onConfigChange={handleMqttConfigChange} isConnected={isMqttConnected} />
        }
      />
      <Toaster />
    </>
  )
}

export default App
