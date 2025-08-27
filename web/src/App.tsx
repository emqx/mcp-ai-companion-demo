import { useMcpOverMqtt } from '@/hooks/useMcpOverMqtt'
import { useEffect, useState } from 'react'
import { ChatInterface } from '@/components/ChatInterface'

function App() {
  const [selectedEmotion, setSelectedEmotion] = useState('happy');
  const { 
    isConnected, 
    connectionState, 
    client
  } = useMcpOverMqtt({
    brokerUrl: 'ws://localhost:8083/mqtt',
    autoConnect: true
  })

  useEffect(() => {
    if (isConnected && client && connectionState === 'connected') {
      console.log('[App] MQTT client connected successfully')
      console.log('[App] Connection state:', connectionState)
      console.log('[App] Client connected:', isConnected)
    }
  }, [isConnected, client, connectionState])

  return (
    <ChatInterface 
      selectedEmotion={selectedEmotion}
      onEmotionSelect={setSelectedEmotion}
    />
  )
}

export default App
