import { useState, useEffect, useRef } from 'react'
import { McpMqttClient } from '@/lib/mcp-over-mqtt'
import type { MqttConnectionOptions, MqttMessage } from '@/types/mqtt'

export interface UseMqttOptions extends MqttConnectionOptions {
  autoConnect?: boolean
}

export interface UseMqttReturn {
  client: McpMqttClient | null
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
}

export function useMcpOverMqtt(options: UseMqttOptions = {}): UseMqttReturn {
  const { autoConnect = true, ...mqttOptions } = options
  
  const [client, setClient] = useState<McpMqttClient | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [connectionState, setConnectionState] = useState('disconnected')
  const [messages, setMessages] = useState<MqttMessage[]>([])
  
  const clientRef = useRef<McpMqttClient | null>(null)

  useEffect(() => {
    const mqttClient = new McpMqttClient(mqttOptions)
    clientRef.current = mqttClient
    setClient(mqttClient)

    mqttClient.onConnect(() => {
      setIsConnected(true)
      setIsConnecting(false)
      setError(null)
      setConnectionState('connected')
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
  }, [])

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
    messages
  }
}

export default useMcpOverMqtt