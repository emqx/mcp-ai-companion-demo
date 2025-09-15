import { useMcpMqttServer } from '@/hooks/useMcpMqttServer'
import { useWebRTCMqtt } from '@/hooks/useWebRTCMqtt'
import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { ChatInterface } from '@/components/ChatInterface'
import { appLogger, mqttLogger } from '@/utils/logger'
import { capturePhotoFromVideo } from '@/utils/photo-capture'
import type { PhotoCaptureResult } from '@/tools/types'
import { Toaster } from '@/components/ui/sonner'
import { toast } from 'sonner'
import { defaultMqttConfig } from '@/config/mqtt'
import { loadMqttConfig, saveMqttConfig, type MqttConfig } from '@/utils/storage'

function App() {
  const [aiReplyText, setAiReplyText] = useState<string>('')
  const [llmLoading, setLlmLoading] = useState<'processing' | 'waiting' | null>()
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

  const onCameraControl = useCallback((enabled: boolean) => {
    appLogger.info(`📷 Camera control: ${enabled ? 'ON' : 'OFF'}`)
    setShowVideo(enabled)
  }, [])

  const onEmotionChange = useCallback((emotion: string) => {
    appLogger.info(`😊 Emotion changed: ${emotion}`)
    setSelectedEmotion(emotion)
  }, [])

  const onTakePhoto = useCallback(async (source: 'local' | 'remote', quality: number): Promise<PhotoCaptureResult> => {
    appLogger.info(`📸 Taking photo: source=${source}, quality=${quality}`)
    if (!videoRef.current) {
      setShowVideo(true)
    }
    await new Promise((resolve) => setTimeout(resolve, 500)) // Wait for video to be ready
    if (!videoRef?.current?.videoWidth || !videoRef?.current?.videoHeight) {
      throw new Error('Video not ready for capture')
    }
    const result = await capturePhotoFromVideo(videoRef.current, source, {
      quality,
      upload: {
        url: '/api/upload',
        formFieldName: 'file',
      },
    })

    appLogger.info(`📸 Photo captured successfully: ${result.filename}`)

    // Auto close camera after successful capture with delay
    if (result.blob) {
      appLogger.info('📷 Camera auto-closed after photo capture')
      setTimeout(() => {
        setShowVideo(false)
        appLogger.info('📷 Camera auto-closed after photo capture')
      }, 3500)
    }
    return result
  }, [])

  const onVolumeControl = useCallback((newVolume?: number, muted?: boolean) => {
    // Update volume if provided (0.0 to 1.0)
    if (newVolume !== undefined) {
      setVolume(newVolume)
      const volumePercent = Math.round(newVolume * 100)
      appLogger.info(`🔊 Volume set to ${volumePercent}%`)
      toast(`音量调至 ${volumePercent}%`, {
        duration: 3000,
      })
    }

    // Update muted state if provided
    if (muted !== undefined) {
      setIsMuted(muted)
      const message = muted ? '音频已静音' : '音频已取消静音'
      appLogger.info(`🔊 Audio ${muted ? 'muted' : 'unmuted'}`)
      toast(message, {
        duration: 3000,
      })
    }

    // Apply changes to audio element if it exists
    if (audioRef.current) {
      if (newVolume !== undefined) {
        audioRef.current.volume = newVolume
      }
      if (muted !== undefined) {
        audioRef.current.muted = muted
      }
    }
  }, [])

  const onMqttConfigChange = useCallback((newConfig: MqttConfig) => {
    setMqttConfig(newConfig)
    saveMqttConfig(newConfig)
    appLogger.info('💾 MQTT config saved to localStorage')
    // TODO: Reconnect MQTT with new config
  }, [])

  const callbacks = useMemo(
    () => ({
      onCameraControl,
      onEmotionChange,
      onTakePhoto,
      onVolumeControl,
    }),
    [onCameraControl, onEmotionChange, onTakePhoto, onVolumeControl],
  )

  const {
    client: mcpMqttClient,
    isConnected: isMqttConnected,
    isMcpInitialized,
  } = useMcpMqttServer({
    brokerUrl: mqttConfig.brokerUrl,
    username: mqttConfig.username,
    password: mqttConfig.password,
    autoConnect: true,
    callbacks,
  })

  const onSendMessage = useCallback(
    async (message: string) => {
      if (!mcpMqttClient) {
        throw new Error('MQTT client is not available')
      }
      try {
        const topic = `$message/${mcpMqttClient.getClientId()}/multimedia_proxy`
        await mcpMqttClient.publish(topic, message)
        mqttLogger.info(`Message sent to ${topic}: ${message}`)
      } catch (error) {
        mqttLogger.error('Failed to send MQTT message:', error)
        throw error
      }
    },
    [mcpMqttClient],
  )

  const {
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
  } = useWebRTCMqtt({
    mqttClient: mcpMqttClient?.getMqttClient() || null,
    onASRResponse: () => {
      setAiReplyText('')
    },
    onTTSText: (text: string) => {
      setAiReplyText(text)
    },
    onMessage: (message: any) => {
      appLogger.info('🔊 Message:', message)

      // Handle loading messages
      if (message && typeof message === 'object' && message.type === 'loading') {
        const status = message.status
        if (status === 'processing' || status === 'waiting') {
          setLlmLoading(status)
          setAiReplyText('')
        } else if (status === 'complete') {
          setLlmLoading(null)
        }
      }
    },
  })

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

  // Cleanup WebRTC when component unmounts
  useEffect(() => {
    return () => {
      if (cleanupWebRTC) {
        cleanupWebRTC()
      }
    }
  }, [cleanupWebRTC])

  return (
    <>
      <ChatInterface
        webrtc={{
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
        isMqttConnected={isMqttConnected}
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
        mqttConfig={mqttConfig}
        onMqttConfigChange={onMqttConfigChange}
        onSendMessage={onSendMessage}
      />
      <Toaster />
    </>
  )
}

export default App
