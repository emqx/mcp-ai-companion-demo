import { useMcpMqttServer } from '@/hooks/useMcpMqttServer'
import { useWebRTCMqtt } from '@/hooks/useWebRTCMqtt'
import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { ChatInterface } from '@/components/ChatInterface'
import { appLogger } from '@/utils/logger'
import { capturePhotoFromVideo } from '@/utils/photo-capture'
import type { PhotoCaptureResult } from '@/tools/types'
import { Toaster } from '@/components/ui/sonner'
import { toast } from 'sonner'
import { defaultMqttConfig } from '@/config/mqtt'
import { loadMqttConfig, saveMqttConfig, type MqttConfig } from '@/utils/storage'

function App() {
  const [aiReplyText, setAiReplyText] = useState<string>('')
  const [showVideo, setShowVideo] = useState<boolean>(false)
  const [selectedEmotion, setSelectedEmotion] = useState<string>('happy')
  const [volume, setVolume] = useState<number>(1.0) // 0.0 to 1.0
  const [isMuted, setIsMuted] = useState<boolean>(false)
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
      reconnectPeriod: defaultMqttConfig.reconnectPeriod
    }
  })
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)

  const onCameraControl = useCallback((enabled: boolean) => {
    setShowVideo(enabled)
  }, [])

  const onEmotionChange = useCallback((emotion: string) => {
    setSelectedEmotion(emotion)
  }, [])

  const onTakePhoto = useCallback(async (source: 'local' | 'remote', quality: number): Promise<PhotoCaptureResult> => {
    if (!videoRef.current) {
      setShowVideo(true)
    }
    await new Promise((resolve) => setTimeout(resolve, 500)) // Wait for video to be ready
    if (!videoRef?.current?.videoWidth || !videoRef?.current?.videoHeight) {
      throw new Error('Video not ready for capture')
    }
    return await capturePhotoFromVideo(videoRef.current, source, { 
      quality,
      upload: {
        url: '/api/upload',
        formFieldName: 'file'
      }
    })
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

  const callbacks = useMemo(() => ({
    onCameraControl,
    onEmotionChange,
    onTakePhoto,
    onVolumeControl
  }), [onCameraControl, onEmotionChange, onTakePhoto, onVolumeControl])

  const {
    isConnected: isMqttConnected,
    isMcpInitialized
  } = useMcpMqttServer({
    brokerUrl: mqttConfig.brokerUrl,
    username: mqttConfig.username,
    password: mqttConfig.password,
    connectTimeout: mqttConfig.connectTimeout,
    reconnectPeriod: mqttConfig.reconnectPeriod,
    autoConnect: true,
    callbacks,
  })

  const {
    remoteStream,
    mqttConnected: isWebRTCMqttConnected,
    isConnecting: isWebRTCConnecting,
    isConnected: isWebRTCConnected,
    error: webRTCError,
    connect: connectWebRTC,
    disconnect: disconnectWebRTC,
    toggleAudio,
    toggleVideo,
    isAudioEnabled,
    isVideoEnabled
  } = useWebRTCMqtt({
    autoConnect: false,
    brokerUrl: mqttConfig.brokerUrl,
    username: mqttConfig.username,
    password: mqttConfig.password,
    connectTimeout: mqttConfig.connectTimeout,
    reconnectPeriod: mqttConfig.reconnectPeriod,
    onASRResponse: (results: string) => {
      console.log('🎤 ASR Response received:', results)
      // Clear AI reply text when user starts speaking
      setAiReplyText('')
    },
    onTTSText: (text: string) => {
      console.log('🔊 TTS Text received:', text)
      console.log('Setting aiReplyText to:', text)
      setAiReplyText(text)
    }
  })

  useEffect(() => {
    if (isMqttConnected && isMcpInitialized) {
      appLogger.info('🚀 MCP Server ready to receive commands')
    }
  }, [isMqttConnected, isMcpInitialized])

  useEffect(() => {
    if (isWebRTCMqttConnected) {
      appLogger.info('📡 WebRTC MQTT connected')
    }
    if (isWebRTCConnected) {
      appLogger.info('🎥 WebRTC connected successfully')
    }
  }, [isWebRTCMqttConnected, isWebRTCConnected])

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
          toggleVideo
        }}
        isMqttConnected={isMqttConnected}
        aiReplyText={aiReplyText}
        showVideo={showVideo}
        setShowVideo={setShowVideo}
        selectedEmotion={selectedEmotion}
        setSelectedEmotion={setSelectedEmotion}
        videoRef={videoRef}
        audioRef={audioRef}
        volume={volume}
        isMuted={isMuted}
        mqttConfig={mqttConfig}
        onMqttConfigChange={onMqttConfigChange}
      />
      <Toaster />
    </>
  )
}

export default App
