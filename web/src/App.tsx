import { useMcpMqttServer } from '@/hooks/useMcpMqttServer'
import { useWebRTCMqtt } from '@/hooks/useWebRTCMqtt'
import { useEffect, useState } from 'react'
import { ChatInterface } from '@/components/ChatInterface'
import { appLogger } from '@/utils/logger'

function App() {
  const [aiReplyText, setAiReplyText] = useState<string>('')

  const { 
    isConnected: isMqttConnected,
    isMcpInitialized
  } = useMcpMqttServer({
    autoConnect: true
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
    />
  )
}

export default App
