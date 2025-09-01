import mqtt, { type MqttClient as BaseMqttClient } from 'mqtt'
import type { 
  MqttConnectionOptions, 
  MqttMessage,
  JsonRpcRequest,
  McpToolsCallResult,
} from '@/types/mqtt'
import { mcpLogger, mqttLogger } from '@/utils/logger'

export class McpMqttServer {
  private mqttClient: BaseMqttClient | null = null
  private connectionOptions: MqttConnectionOptions
  private connectionState: 'disconnected' | 'connecting' | 'connected' | 'error' = 'disconnected'
  private eventListeners: {
    onConnect?: () => void
    onDisconnect?: () => void
    onMessage?: (message: MqttMessage) => void
    onError?: (error: Error) => void
  } = {}
  
  // MCP-specific properties
  private serverId: string
  private serverName: string
  private callbacks: {
    onCameraControl?: (enabled: boolean) => void
    onEmotionChange?: (emotion: string) => void
  }
  private isInitialized = false

  constructor(options: MqttConnectionOptions & { 
    serverId?: string, 
    serverName?: string,
    callbacks?: {
      onCameraControl?: (enabled: boolean) => void
      onEmotionChange?: (emotion: string) => void
    }
  } = {}) {
    const { serverId, serverName, callbacks, ...mqttOptions } = options
    
    this.serverId = serverId || 'default-server'
    this.serverName = serverName || 'mcp-ai-companion-demo-web-ui'
    this.callbacks = callbacks || {}
    
    const clientId = `mcp-ai-web-ui-${Math.random().toString(16).substring(2, 10)}`
    
    this.connectionOptions = {
      brokerUrl: 'ws://localhost:8083/mqtt',
      clientId,
      clean: true,
      connectTimeout: 4000,
      reconnectPeriod: 1000,
      protocolVersion: 5, // MQTT 5.0 required by MCP over MQTT spec
      will: {
        topic: `$mcp-client/presence/${clientId}`,
        payload: JSON.stringify({
          jsonrpc: '2.0',
          method: 'notifications/disconnected'
        }),
        qos: 0,
        retain: false
      },
      properties: {
        userProperties: {
          'MCP-COMPONENT-TYPE': 'mcp-client',
          'MCP-META': JSON.stringify({
            version: '1.0.0',
            implementation: 'mcp-ai-companion-demo-web-ui',
            location: 'web-browser'
          })
        }
      },
      ...mqttOptions
    }
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.mqttClient && this.connectionState === 'connected') {
        resolve()
        return
      }

      this.connectionState = 'connecting'
      
      try {
        this.mqttClient = mqtt.connect(this.connectionOptions.brokerUrl!, this.connectionOptions)
        
        this.mqttClient.on('connect', () => {
          this.connectionState = 'connected'
          mqttLogger.info(`✅ Step 1/3: Connected to broker (${this.connectionOptions.clientId})`)
          
          // Use setTimeout to avoid race condition with subscriptions
          setTimeout(() => {
            mqttLogger.info(`📡 Step 2/3: Starting MCP topic subscriptions...`)
            this.subscribeToMcpTopics()
          }, 100)
          
          this.eventListeners.onConnect?.()
          resolve()
        })

        this.mqttClient.on('disconnect', () => {
          this.connectionState = 'disconnected'
          mqttLogger.warn('🔌 Disconnected from broker')
          this.eventListeners.onDisconnect?.()
        })

        this.mqttClient.on('message', (topic, payload, packet) => {
          const message: MqttMessage = {
            topic,
            payload: payload.toString(),
            qos: packet.qos as 0 | 1 | 2,
            retain: packet.retain,
            userProperties: packet.properties?.userProperties
          }
          // Don't log every message, too noisy
          
          // Handle MCP messages on $mcp-server and $mcp-rpc topics
          if (topic.startsWith('$mcp-server/') || topic.startsWith('$mcp-rpc/')) {
            this.handleMcpMessage(message)
          }
          
          this.eventListeners.onMessage?.(message)
        })

        this.mqttClient.on('error', (error) => {
          this.connectionState = 'error'
          mqttLogger.error('❌ Connection error:', error.message)
          this.eventListeners.onError?.(error)
          reject(error)
        })

        this.mqttClient.on('reconnect', () => {
          mqttLogger.info('🔄 Reconnecting...')
        })

      } catch (error) {
        this.connectionState = 'error'
        reject(error)
      }
    })
  }

  async disconnect(): Promise<void> {
    return new Promise((resolve) => {
      if (this.mqttClient) {
        this.mqttClient.end(false, {}, () => {
          this.connectionState = 'disconnected'
          mqttLogger.warn('🔌 Connection closed')
          resolve()
        })
      } else {
        resolve()
      }
    })
  }

  async publish(topic: string, message: string, options?: { qos?: 0 | 1 | 2, retain?: boolean }): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.mqttClient || this.connectionState !== 'connected') {
        reject(new Error('MQTT client is not connected'))
        return
      }

      this.mqttClient.publish(topic, message, {
        qos: (options?.qos || 0) as 0 | 1 | 2,
        retain: options?.retain || false,
        properties: {
          userProperties: {
            'MCP-MQTT-CLIENT-ID': this.connectionOptions.clientId || ''
          }
        }
      }, (error) => {
        if (error) {
          mqttLogger.error(`❌ Publish failed to "${topic}"`)
          reject(error)
        } else {
          // Success publish is too noisy, skip logging
          resolve()
        }
      })
    })
  }

  async subscribe(topic: string | string[], qos: 0 | 1 | 2 = 0): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.mqttClient || this.connectionState !== 'connected') {
        reject(new Error('MQTT client is not connected'))
        return
      }

      this.mqttClient.subscribe(topic, { qos }, (error, _granted) => {
        if (error) {
          mqttLogger.error(`❌ Subscribe failed to "${topic}" (ClientID: ${this.connectionOptions.clientId}):`, error.message)
          reject(error)
        } else {
          const topics = Array.isArray(topic) ? topic : [topic]
          mqttLogger.info(`✅ Subscribed to: ${topics.join(', ')} (ClientID: ${this.connectionOptions.clientId})`)
          resolve()
        }
      })
    })
  }

  async unsubscribe(topic: string | string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.mqttClient) {
        resolve()
        return
      }

      this.mqttClient.unsubscribe(topic, {}, (error) => {
        if (error) {
          mqttLogger.error(`Failed to unsubscribe from "${topic}":`, error)
          reject(error)
        } else {
          mqttLogger.info(`Unsubscribed from "${topic}"`)
          resolve()
        }
      })
    })
  }

  onConnect(callback: () => void): void {
    this.eventListeners.onConnect = callback
  }

  onDisconnect(callback: () => void): void {
    this.eventListeners.onDisconnect = callback
  }

  onMessage(callback: (message: MqttMessage) => void): void {
    this.eventListeners.onMessage = callback
  }

  onError(callback: (error: Error) => void): void {
    this.eventListeners.onError = callback
  }

  getConnectionState(): string {
    return this.connectionState
  }

  isConnected(): boolean {
    return this.connectionState === 'connected'
  }

  getMqttClient(): BaseMqttClient | null {
    return this.mqttClient
  }

  getClientId(): string | undefined {
    return this.connectionOptions.clientId
  }

  // MCP Server Protocol Methods
  private async subscribeToMcpTopics(): Promise<void> {
    if (!this.mqttClient || this.connectionState !== 'connected') {
      mcpLogger.warn('Cannot subscribe - client not connected')
      return
    }
    
    try {
      // Subscribe to server control topic to receive initialize requests
      const controlTopic = `$mcp-server/${this.serverId}/${this.serverName}`
      mcpLogger.info(`📡 Subscribing to control topic for initialize requests: ${controlTopic} (ClientID: ${this.connectionOptions.clientId})`)
      await this.subscribe(controlTopic)
      
      // Subscribe to RPC topic to receive tools/list and tools/call requests
      const rpcTopic = `$mcp-rpc/+/${this.serverId}/${this.serverName}`
      mcpLogger.info(`📡 Subscribing to RPC topic for tools/list and tools/call: ${rpcTopic} (ClientID: ${this.connectionOptions.clientId})`)
      await this.subscribe(rpcTopic)
      
      mcpLogger.info(`📡 Step 2/3 Complete: MCP Server ready to receive commands (ClientID: ${this.connectionOptions.clientId})`)
      
      // Publish server online notification with RETAIN flag
      mcpLogger.info(`📢 Step 3/3: Publishing server online notification...`)
      const presenceTopic = `$mcp-server/presence/${this.serverId}/${this.serverName}`
      const onlineNotification = {
        jsonrpc: '2.0',
        method: 'notifications/server/online',
        params: {
          server_name: this.serverName,
          description: 'Web UI hardware controller for camera and emotion control'
        }
      }
      mcpLogger.info(`📢 Publishing to presence topic: ${presenceTopic} (ClientID: ${this.connectionOptions.clientId})`)
      await this.publish(presenceTopic, JSON.stringify(onlineNotification), { retain: true })
      mcpLogger.info(`✅ Step 3/3 Complete: MCP Server online (ServerID: ${this.serverId}, ServerName: ${this.serverName})`)
      
    } catch (error) {
      mcpLogger.error(`❌ Failed to subscribe to MCP topics (ClientID: ${this.connectionOptions.clientId}):`, error instanceof Error ? error.message : String(error))
    }
  }

  private handleMcpMessage(message: MqttMessage): void {
    try {
      const data = JSON.parse(message.payload) as JsonRpcRequest
      
      // Extract client ID from topic: $mcp-server/{server-id}/{server-name}
      // For control topic, we need to get client ID from the request itself
      const topicParts = message.topic.split('/')
      let clientId = ''
      
      if (message.topic.startsWith('$mcp-server/')) {
        // Control topic - get client ID from User Properties
        const clientIdProp = message.userProperties?.['MCP-MQTT-CLIENT-ID']
        clientId = Array.isArray(clientIdProp) ? clientIdProp[0] : (clientIdProp || 'unknown')
      } else if (message.topic.startsWith('$mcp-rpc/')) {
        // RPC topic format: $mcp-rpc/{mcp-client-id}/{server-id}/{server-name}
        clientId = topicParts[1]
      }
      
      // Handle different request methods
      switch (data.method) {
        case 'initialize':
          this.handleInitializeRequest(data, clientId)
          break
        case 'tools/list':
          this.handleToolsListRequest(data, clientId)
          break
        case 'tools/call':
          this.handleToolsCallRequest(data, clientId)
          break
        default:
          mcpLogger.warn(`❓ Unknown tool: ${data.params?.name}`)
      }
    } catch (error) {
      const err = error as unknown as Error
      mcpLogger.error('❌ Message handling failed:', err.message)
    }
  }


  // MCP Server Methods - Handle incoming requests
  private async handleInitializeRequest(request: JsonRpcRequest, clientId: string): Promise<void> {
    mcpLogger.info(`🚀 Initialize request from ClientID: ${clientId} (ServerID: ${this.serverId})`)
    
    const response = {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        protocolVersion: '2025-06-18',
        capabilities: {
          tools: {
            listChanged: true
          }
        },
        serverInfo: {
          name: this.serverName,
          version: '1.0.0'
        }
      }
    }
    
    const responseTopic = `$mcp-rpc/${clientId}/${this.serverId}/${this.serverName}`
    mcpLogger.info(`📤 Sending initialize response to topic: ${responseTopic} (ClientID: ${clientId})`)
    await this.publish(responseTopic, JSON.stringify(response))
    this.isInitialized = true
    mcpLogger.info(`✅ MCP Server initialized and ready for ClientID: ${clientId}`)
  }

  private async handleToolsListRequest(request: JsonRpcRequest, clientId: string): Promise<void> {
    mcpLogger.info(`🔧 Tools/list request from ClientID: ${clientId} (ServerID: ${this.serverId})`)
    
    const response = {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        tools: [
          {
            name: 'control_camera',
            description: 'Control the camera (enable/disable video feed)',
            inputSchema: {
              type: 'object',
              properties: {
                enabled: {
                  type: 'boolean',
                  description: 'Whether to enable or disable the camera'
                }
              },
              required: ['enabled']
            }
          },
          {
            name: 'change_emotion',
            description: 'Change the avatar emotion/animation',
            inputSchema: {
              type: 'object',
              properties: {
                emotion: {
                  type: 'string',
                  description: 'The emotion to display',
                  enum: ['happy', 'sad', 'angry', 'surprised', 'thinking', 'playful', 'relaxed', 'serious', 'shy', 'tired', 'disappointed', 'laug']
                }
              },
              required: ['emotion']
            }
          }
        ]
      }
    }
    
    const responseTopic = `$mcp-rpc/${clientId}/${this.serverId}/${this.serverName}`
    mcpLogger.info(`📤 Sending tools list to topic: ${responseTopic} (ClientID: ${clientId})`)
    mcpLogger.info(`✅ Sent ${response.result.tools.length} tools to ClientID: ${clientId}`)
    await this.publish(responseTopic, JSON.stringify(response))
  }

  private async handleToolsCallRequest(request: JsonRpcRequest, clientId: string): Promise<void> {
    const { name, arguments: args } = request.params || {}
    mcpLogger.info(`🛠️ Tools/call request: "${name}" from ClientID: ${clientId} (ServerID: ${this.serverId})`)
    let result: McpToolsCallResult
    
    try {
      switch (name) {
        case 'control_camera':
          mcpLogger.info(`📷 Camera ${args?.enabled ? 'ON' : 'OFF'}`)
          if (this.callbacks.onCameraControl) {
            this.callbacks.onCameraControl(args?.enabled)
          }
          result = {
            content: [{
              type: 'text',
              text: `Camera ${args?.enabled ? 'enabled' : 'disabled'} successfully`
            }]
          }
          break
          
        case 'change_emotion':
          mcpLogger.info(`😊 Emotion: ${args?.emotion}`)
          if (this.callbacks.onEmotionChange) {
            this.callbacks.onEmotionChange(args?.emotion)
          }
          result = {
            content: [{
              type: 'text',
              text: `Emotion changed to ${args?.emotion} successfully`
            }]
          }
          break
          
        default:
          throw new Error(`Unknown tool: ${name}`)
      }
      
      const response = {
        jsonrpc: '2.0',
        id: request.id,
        result
      }
      
      const responseTopic = `$mcp-rpc/${clientId}/${this.serverId}/${this.serverName}`
      mcpLogger.info(`📤 Sending tool result to topic: ${responseTopic} (ClientID: ${clientId})`)
      await this.publish(responseTopic, JSON.stringify(response))
      
    } catch (error) {
      const errorResponse = {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32000,
          message: error instanceof Error ? error.message : String(error)
        }
      }
      
      const responseTopic = `$mcp-rpc/${clientId}/${this.serverId}/${this.serverName}`
      mcpLogger.error(`📤 Sending error response to topic: ${responseTopic} (ClientID: ${clientId}):`, error instanceof Error ? error.message : String(error))
      await this.publish(responseTopic, JSON.stringify(errorResponse))
    }
  }


  isMcpInitialized(): boolean {
    return this.isInitialized
  }
}

export default McpMqttServer
