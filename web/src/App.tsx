import { useMcpMqttServer } from '@/hooks/useMcpMqttServer'
import { useEffect, useState } from 'react'
import { ChatInterface } from '@/components/ChatInterface'

function App() {
  const [selectedEmotion, setSelectedEmotion] = useState('happy');
  const [showVideo, setShowVideo] = useState(false);

  const { 
    isConnected,
    isMcpInitialized
  } = useMcpMqttServer({
    brokerUrl: 'ws://localhost:8083/mqtt',
    autoConnect: true,
    serverId: 'web-ui-hardware-server',
    serverName: 'web-ui-hardware-controller',
    callbacks: {
      onCameraControl: (enabled: boolean) => {
        console.log('[App] Camera control:', enabled);
        setShowVideo(enabled);
      },
      onEmotionChange: (emotion: string) => {
        console.log('[App] Emotion change:', emotion);
        setSelectedEmotion(emotion);
      }
    }
  })

  useEffect(() => {
    if (isConnected && isMcpInitialized) {
      console.log('[App] MCP Server ready to receive commands')
    }
  }, [isConnected, isMcpInitialized])

  return (
    <ChatInterface 
      selectedEmotion={selectedEmotion}
      onEmotionSelect={setSelectedEmotion}
      showVideo={showVideo}
    />
  )
}

export default App
