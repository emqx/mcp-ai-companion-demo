import { useState, useEffect, useRef } from 'react'
import { McpMqttServer } from '@emqx-ai/mcp-mqtt-sdk'

type McpMqttServerWithCompat = McpMqttServer & {
  getClientId(): string
  getMqttClient(): MqttClient
  publish(topic: string, message: string): Promise<void>
}
import { mcpServerConfig } from '@/config/mqtt'
import { mcpLogger } from '@/utils/logger'
import { McpTools, createToolContext } from '@/tools'
import { generateRandomId } from '@/utils/id-generator'
import type { MqttClient } from 'mqtt'

export interface UseMqttOptions {
  brokerUrl?: string
  username?: string
  password?: string
  autoConnect?: boolean
  serverName?: string
  callbacks?: {
    onCameraControl?: (enabled: boolean) => void
    onEmotionChange?: (emotion: string) => void
  }
}

export interface UseMqttServerReturn {
  client: McpMqttServerWithCompat | null
  isConnected: boolean
  isConnecting: boolean
  error: Error | null
  connectionState: string
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  isMcpInitialized: boolean
}

export function useMcpMqttServer(options: UseMqttOptions = {}): UseMqttServerReturn {
  const { autoConnect = true, serverName, callbacks, ...mqttOptions } = options

  const [client, setClient] = useState<McpMqttServerWithCompat | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [connectionState, setConnectionState] = useState('disconnected')
  const [isMcpInitialized, setIsMcpInitialized] = useState(false)

  const clientRef = useRef<McpMqttServerWithCompat | null>(null)

  useEffect(() => {
    const randomId = generateRandomId(8)
    const serverId = `mcp-ai-web-ui-${randomId}`
    const fullServerName = `${serverName || 'web-ui-hardware-controller'}/${randomId}`

    const brokerUrl = mqttOptions.brokerUrl || mcpServerConfig.brokerUrl

    const server = new McpMqttServer({
      host: brokerUrl,
      username: mqttOptions.username || mcpServerConfig.username,
      password: mqttOptions.password || mcpServerConfig.password,
      serverId,
      serverName: fullServerName,
      name: 'Web UI Hardware Controller',
      version: '1.0.0',
      description: 'Web UI hardware controller for camera and emotion control',
      capabilities: {
        tools: { listChanged: true },
      },
    })

    // Register tools
    const tools = McpTools.list()
    const toolCallbacks = callbacks || {}

    tools.forEach((tool) => {
      server.tool(tool.name, tool.description || '', tool.inputSchema || {}, async (args) => {
        mcpLogger.info(`🛠️ Executing tool: ${tool.name}`)

        try {
          const validation = McpTools.validate(tool.name, args || {})
          if (!validation.valid) {
            throw new Error(`Invalid arguments: ${validation.errors?.join(', ')}`)
          }

          const toolContext = createToolContext(toolCallbacks)
          const executionResult = await McpTools.execute(tool.name, args || {}, toolContext)

          if (!executionResult.success) {
            return {
              content: [
                {
                  type: 'text',
                  text: executionResult.message,
                },
              ],
              isError: true,
            }
          }

          return {
            content: [
              {
                type: 'text',
                text: executionResult.message,
              },
            ],
          }
        } catch (error) {
          mcpLogger.error(`❌ Tool execution failed: ${tool.name}`, error)
          return {
            content: [
              {
                type: 'text',
                text: error instanceof Error ? error.message : String(error),
              },
            ],
            isError: true,
          }
        }
      })
    })

    mcpLogger.info(`📋 Registered ${tools.length} tools`)

    const serverWithCompat = Object.assign(server, {
      getClientId: () => serverId,
      publish: async (topic: string, message: string) => {
        const mqttClient = server.getMqttClient()
        if (mqttClient) {
          await new Promise<void>((resolve, reject) => {
            mqttClient.publish(topic, message, (error: Error) => {
              if (error) {
                reject(error)
              } else {
                resolve()
              }
            })
          })
          mcpLogger.debug(`📤 Published to ${topic}: ${message}`)
        } else {
          throw new Error('MQTT client not available')
        }
      },
    })

    clientRef.current = serverWithCompat
    setClient(serverWithCompat)

    server.on('ready', () => {
      setIsConnected(true)
      setIsConnecting(false)
      setError(null)
      setConnectionState('connected')
      setIsMcpInitialized(true)
      mcpLogger.info(`✅ MCP Server ready (ServerID: ${serverId})`)
    })

    server.on('error', (err) => {
      setError(err)
      setIsConnecting(false)
      setConnectionState('error')
      mcpLogger.error('❌ MCP Server error:', err.message)
    })

    server.on('closed', () => {
      setIsConnected(false)
      setIsConnecting(false)
      setConnectionState('disconnected')
      setIsMcpInitialized(false)
      mcpLogger.warn('🔌 MCP Server disconnected')
    })

    if (autoConnect) {
      setIsConnecting(true)
      server.start().catch((err) => {
        setError(err)
        setIsConnecting(false)
      })
    }

    return () => {
      if (clientRef.current) {
        clientRef.current.stop()
      }
    }
  }, [autoConnect, serverName, callbacks, mqttOptions.brokerUrl, mqttOptions.username, mqttOptions.password])

  const connect = async () => {
    if (!client) return

    setIsConnecting(true)
    setError(null)

    try {
      await client.start()
    } catch (err) {
      setError(err as Error)
      setIsConnecting(false)
    }
  }

  const disconnect = async () => {
    if (!client) return

    try {
      await client.stop()
    } catch (err) {
      setError(err as Error)
    }
  }

  return {
    client,
    isConnected,
    isConnecting,
    error,
    connectionState,
    connect,
    disconnect,
    isMcpInitialized,
  }
}

export default useMcpMqttServer
