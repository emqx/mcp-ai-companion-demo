import { useMcpOverMqtt } from '@/hooks/useMcpOverMqtt'
import { useEffect } from 'react'

function App() {
  const { 
    isConnected, 
    isConnecting, 
    error, 
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
    <div className="container mx-auto p-8">
      <h1 className="text-4xl font-bold mb-8">MCP over MQTT Client</h1>
      
      <div className="space-y-4">
        <div className="p-4 border rounded-lg">
          <h2 className="text-xl font-semibold mb-2">Connection Status</h2>
          <div className="space-y-2">
            <p>Status: <span className={`font-mono ${
              isConnected ? 'text-green-600' : 
              isConnecting ? 'text-yellow-600' : 
              error ? 'text-red-600' : 'text-gray-600'
            }`}>
              {isConnecting ? 'CONNECTING' : connectionState.toUpperCase()}
            </span></p>
            <p>Broker: <span className="font-mono">ws://localhost:8083/mqtt</span></p>
            {error && (
              <p className="text-red-600">Error: {error.message}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
