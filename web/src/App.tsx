import { useMcpMqttServer } from '@/hooks/useMcpMqttServer'
import { useWebRTCMqtt } from '@/hooks/useWebRTCMqtt'
import { useEffect } from 'react'
import { ChatInterface } from '@/components/ChatInterface'
import { appLogger } from '@/utils/logger'

function App() {

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
    autoConnect: false
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
    />
  )
}

export default App
