import mqtt, { type MqttClient as BaseMqttClient } from 'mqtt'
import type { 
  MqttConnectionOptions, 
  MqttMessage,
  JsonRpcRequest,
  McpToolsCallResult,
} from '@/types/mqtt'

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
          console.debug(`[MQTT] Connected to ${this.connectionOptions.brokerUrl}`)
          console.debug(`[MQTT] Client ID: ${this.connectionOptions.clientId}`)
          
          // Use setTimeout to avoid race condition with subscriptions
          setTimeout(() => {
            this.subscribeToMcpTopics()
          }, 100)
          
          this.eventListeners.onConnect?.()
          resolve()
        })

        this.mqttClient.on('disconnect', () => {
          this.connectionState = 'disconnected'
          console.debug('[MQTT] Disconnected from broker')
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
          console.debug(`[MQTT] Received message on topic "${topic}":`, message.payload)
          
          // Handle MCP messages on $mcp-server and $mcp-rpc topics
          if (topic.startsWith('$mcp-server/') || topic.startsWith('$mcp-rpc/')) {
            this.handleMcpMessage(message)
          }
          
          this.eventListeners.onMessage?.(message)
        })

        this.mqttClient.on('error', (error) => {
          this.connectionState = 'error'
          console.debug('[MQTT] Connection error:', error)
          this.eventListeners.onError?.(error)
          reject(error)
        })

        this.mqttClient.on('reconnect', () => {
          console.debug('[MQTT] Attempting to reconnect...')
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
          console.debug('[MQTT] Connection closed')
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
          console.debug(`[MQTT] Failed to publish to topic "${topic}":`, error)
          reject(error)
        } else {
          console.debug(`[MQTT] Published to topic "${topic}"`, message)
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

      this.mqttClient.subscribe(topic, { qos }, (error, granted) => {
        if (error) {
          console.debug(`[MQTT] Failed to subscribe to topic "${topic}":`, error)
          reject(error)
        } else {
          console.debug(`[MQTT] Subscribed to:`, granted)
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
          console.debug(`[MQTT] Failed to unsubscribe from topic "${topic}":`, error)
          reject(error)
        } else {
          console.debug(`[MQTT] Unsubscribed from topic "${topic}"`)
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

  // MCP Server Protocol Methods
  private async subscribeToMcpTopics(): Promise<void> {
    if (!this.mqttClient || this.connectionState !== 'connected') {
      console.warn('[MCP Server] Cannot subscribe - client not connected')
      return
    }
    
    try {
      // Subscribe to server control topic to receive initialize requests
      const controlTopic = `$mcp-server/${this.serverId}/${this.serverName}`
      await this.subscribe(controlTopic)
      console.debug(`[MCP Server] Subscribed to control topic: ${controlTopic}`)
      
      // Subscribe to RPC topic to receive tools/list and tools/call requests
      const rpcTopic = `$mcp-rpc/+/${this.serverId}/${this.serverName}`
      await this.subscribe(rpcTopic)
      console.debug(`[MCP Server] Subscribed to RPC topic: ${rpcTopic}`)
      
      // Publish server online notification with RETAIN flag
      const presenceTopic = `$mcp-server/presence/${this.serverId}/${this.serverName}`
      const onlineNotification = {
        jsonrpc: '2.0',
        method: 'notifications/server/online',
        params: {
          server_name: this.serverName,
          description: 'Web UI hardware controller for camera and emotion control'
        }
      }
      await this.publish(presenceTopic, JSON.stringify(onlineNotification), { retain: true })
      console.debug(`[MCP Server] Published online notification to: ${presenceTopic}`)
      
    } catch (error) {
      console.debug('[MCP Server] Failed to subscribe to topics:', error)
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
          console.debug(`[MCP Server] Unknown method: ${data.method}`)
      }
    } catch (error) {
      console.debug('[MCP Server] Failed to handle message:', error)
    }
  }


  // MCP Server Methods - Handle incoming requests
  private async handleInitializeRequest(request: JsonRpcRequest, clientId: string): Promise<void> {
    console.log(`[MCP Server] Handling initialize from client: ${clientId}`)
    
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
    console.debug(`[MCP Server] Sending initialize response to: ${responseTopic}`)
    await this.publish(responseTopic, JSON.stringify(response))
    this.isInitialized = true
    console.debug(`[MCP Server] Initialize completed for client: ${clientId}`)
  }

  private async handleToolsListRequest(request: JsonRpcRequest, clientId: string): Promise<void> {
    console.log(`[MCP Server] Handling tools/list from client: ${clientId}`)
    console.debug(`[MCP Server] Request ID: ${request.id}`)
    
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
    console.debug(`[MCP Server] Sending tools list response to: ${responseTopic}`)
    console.debug(`[MCP Server] Tools count: ${response.result.tools.length}`)
    await this.publish(responseTopic, JSON.stringify(response))
  }

  private async handleToolsCallRequest(request: JsonRpcRequest, clientId: string): Promise<void> {
    console.log(`[MCP Server] Handling tools/call from client: ${clientId}`)
    
    const { name, arguments: args } = request.params || {}
    let result: McpToolsCallResult
    
    try {
      switch (name) {
        case 'control_camera':
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
      await this.publish(responseTopic, JSON.stringify(errorResponse))
    }
  }


  isMcpInitialized(): boolean {
    return this.isInitialized
  }
}

export default McpMqttServer
