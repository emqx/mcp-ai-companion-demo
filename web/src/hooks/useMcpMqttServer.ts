import { useState, useEffect, useRef } from 'react'
import { McpMqttServer } from '@/lib/mcp-mqtt-server'
import type { 
  MqttConnectionOptions, 
  MqttMessage,
  McpClientInfo
} from '@/types/mqtt'

export interface UseMqttOptions extends MqttConnectionOptions {
  autoConnect?: boolean
  serverId?: string
  serverName?: string
  autoInitializeMcp?: boolean
  clientInfo?: McpClientInfo
  callbacks?: {
    onCameraControl?: (enabled: boolean) => void
    onEmotionChange?: (emotion: string) => void
  }
}

export interface UseMqttServerReturn {
  client: McpMqttServer | null
  isConnected: boolean
  isConnecting: boolean
  error: Error | null
  connectionState: string
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  publish: (topic: string, message: string, options?: { qos?: 0 | 1 | 2, retain?: boolean }) => Promise<void>
  subscribe: (topic: string | string[], qos?: 0 | 1 | 2) => Promise<void>
  unsubscribe: (topic: string | string[]) => Promise<void>
  messages: MqttMessage[]
  // MCP Server state
  isMcpInitialized: boolean
}

export function useMcpMqttServer(options: UseMqttOptions = {}): UseMqttServerReturn {
  const { 
    autoConnect = true, 
    autoInitializeMcp = false,
    serverId,
    serverName,
    clientInfo,
    callbacks,
    ...mqttOptions 
  } = options
  
  const [client, setClient] = useState<McpMqttServer | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [connectionState, setConnectionState] = useState('disconnected')
  const [messages, setMessages] = useState<MqttMessage[]>([])
  const [isMcpInitialized, setIsMcpInitialized] = useState(false)

  const clientRef = useRef<McpMqttServer | null>(null)
  const mqttOptionsRef = useRef(mqttOptions)

  useEffect(() => {
    mqttOptionsRef.current = mqttOptions
  }, [mqttOptions])

  useEffect(() => {
    const mqttClient = new McpMqttServer({ 
      ...mqttOptionsRef.current, 
      serverId, 
      serverName,
      callbacks
    })
    clientRef.current = mqttClient
    setClient(mqttClient)

    mqttClient.onConnect(() => {
      setIsConnected(true)
      setIsConnecting(false)
      setError(null)
      setConnectionState('connected')
      
      // Server is initialized when connected
      setIsMcpInitialized(true)
    })

    mqttClient.onDisconnect(() => {
      setIsConnected(false)
      setIsConnecting(false)
      setConnectionState('disconnected')
    })

    mqttClient.onError((err) => {
      setError(err)
      setIsConnecting(false)
      setConnectionState('error')
    })

    mqttClient.onMessage((message) => {
      setMessages(prev => [...prev, message])
    })

    if (autoConnect) {
      setIsConnecting(true)
      mqttClient.connect().catch((err) => {
        setError(err)
        setIsConnecting(false)
      })
    }

    return () => {
      if (clientRef.current) {
        clientRef.current.disconnect()
      }
    }
  }, [autoConnect, autoInitializeMcp, serverId, serverName, clientInfo, callbacks])

  const connect = async () => {
    if (!client) return
    
    setIsConnecting(true)
    setError(null)
    
    try {
      await client.connect()
    } catch (err) {
      setError(err as Error)
      setIsConnecting(false)
    }
  }

  const disconnect = async () => {
    if (!client) return
    
    try {
      await client.disconnect()
    } catch (err) {
      setError(err as Error)
    }
  }

  const publish = async (topic: string, message: string, options?: { qos?: 0 | 1 | 2, retain?: boolean }) => {
    if (!client) {
      throw new Error('MQTT client is not initialized')
    }
    return client.publish(topic, message, options)
  }

  const subscribe = async (topic: string | string[], qos: 0 | 1 | 2 = 0) => {
    if (!client) {
      throw new Error('MQTT client is not initialized')
    }
    return client.subscribe(topic, qos)
  }

  const unsubscribe = async (topic: string | string[]) => {
    if (!client) {
      throw new Error('MQTT client is not initialized')
    }
    return client.unsubscribe(topic)
  }


  return {
    client,
    isConnected,
    isConnecting,
    error,
    connectionState,
    connect,
    disconnect,
    publish,
    subscribe,
    unsubscribe,
    messages,
    // MCP Server state
    isMcpInitialized
  }
}

export default useMcpMqttServer