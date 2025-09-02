import { useMcpMqttServer } from '@/hooks/useMcpMqttServer'
import { useWebRTCMqtt } from '@/hooks/useWebRTCMqtt'
import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { ChatInterface } from '@/components/ChatInterface'
import { appLogger } from '@/utils/logger'
import { capturePhotoFromVideo } from '@/utils/photo-capture'
import type { PhotoCaptureResult } from '@/tools/types'
import { Toaster } from '@/components/ui/sonner'

function App() {
  const [aiReplyText, setAiReplyText] = useState<string>('')
  const [showVideo, setShowVideo] = useState<boolean>(false)
  const [selectedEmotion, setSelectedEmotion] = useState<string>('happy')
  const videoRef = useRef<HTMLVideoElement>(null)

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

  const callbacks = useMemo(() => ({
    onCameraControl,
    onEmotionChange,
    onTakePhoto
  }), [onCameraControl, onEmotionChange, onTakePhoto])

  const {
    isConnected: isMqttConnected,
    isMcpInitialized
  } = useMcpMqttServer({
    autoConnect: true,
    callbacks
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
      />
      <Toaster />
    </>
  )
}

export default App
