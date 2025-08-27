import mqtt, { type MqttClient as BaseMqttClient } from 'mqtt'
import type { MqttConnectionOptions, MqttMessage } from '@/types/mqtt'

export class McpMqttClient {
  private client: BaseMqttClient | null = null
  private connectionOptions: MqttConnectionOptions
  private connectionState: 'disconnected' | 'connecting' | 'connected' | 'error' = 'disconnected'
  private eventListeners: {
    onConnect?: () => void
    onDisconnect?: () => void
    onMessage?: (message: MqttMessage) => void
    onError?: (error: Error) => void
  } = {}

  constructor(options: MqttConnectionOptions = {}) {
    this.connectionOptions = {
      brokerUrl: 'ws://localhost:8083/mqtt',
      clientId: `web-client-${Math.random().toString(16).substring(2, 10)}`,
      clean: true,
      connectTimeout: 4000,
      reconnectPeriod: 1000,
      ...options
    }
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.client && this.connectionState === 'connected') {
        resolve()
        return
      }

      this.connectionState = 'connecting'
      
      try {
        this.client = mqtt.connect(this.connectionOptions.brokerUrl!, this.connectionOptions)
        
        this.client.on('connect', () => {
          this.connectionState = 'connected'
          console.log(`[MQTT] Connected to ${this.connectionOptions.brokerUrl}`)
          console.log(`[MQTT] Client ID: ${this.connectionOptions.clientId}`)
          this.eventListeners.onConnect?.()
          resolve()
        })

        this.client.on('disconnect', () => {
          this.connectionState = 'disconnected'
          console.log('[MQTT] Disconnected from broker')
          this.eventListeners.onDisconnect?.()
        })

        this.client.on('message', (topic, payload, packet) => {
          const message: MqttMessage = {
            topic,
            payload: payload.toString(),
            qos: packet.qos as 0 | 1 | 2,
            retain: packet.retain
          }
          console.log(`[MQTT] Received message on topic "${topic}":`, message.payload)
          this.eventListeners.onMessage?.(message)
        })

        this.client.on('error', (error) => {
          this.connectionState = 'error'
          console.error('[MQTT] Connection error:', error)
          this.eventListeners.onError?.(error)
          reject(error)
        })

        this.client.on('reconnect', () => {
          console.log('[MQTT] Attempting to reconnect...')
        })

      } catch (error) {
        this.connectionState = 'error'
        reject(error)
      }
    })
  }

  async disconnect(): Promise<void> {
    return new Promise((resolve) => {
      if (this.client) {
        this.client.end(false, {}, () => {
          this.connectionState = 'disconnected'
          console.log('[MQTT] Connection closed')
          resolve()
        })
      } else {
        resolve()
      }
    })
  }

  async publish(topic: string, message: string, options?: { qos?: 0 | 1 | 2, retain?: boolean }): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.client || this.connectionState !== 'connected') {
        reject(new Error('MQTT client is not connected'))
        return
      }

      this.client.publish(topic, message, {
        qos: (options?.qos || 0) as 0 | 1 | 2,
        retain: options?.retain || false
      }, (error) => {
        if (error) {
          console.error(`[MQTT] Failed to publish to topic "${topic}":`, error)
          reject(error)
        } else {
          console.log(`[MQTT] Published to topic "${topic}":`, message)
          resolve()
        }
      })
    })
  }

  async subscribe(topic: string | string[], qos: 0 | 1 | 2 = 0): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.client || this.connectionState !== 'connected') {
        reject(new Error('MQTT client is not connected'))
        return
      }

      this.client.subscribe(topic, { qos }, (error, granted) => {
        if (error) {
          console.error(`[MQTT] Failed to subscribe to topic "${topic}":`, error)
          reject(error)
        } else {
          console.log(`[MQTT] Subscribed to:`, granted)
          resolve()
        }
      })
    })
  }

  async unsubscribe(topic: string | string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.client) {
        resolve()
        return
      }

      this.client.unsubscribe(topic, {}, (error) => {
        if (error) {
          console.error(`[MQTT] Failed to unsubscribe from topic "${topic}":`, error)
          reject(error)
        } else {
          console.log(`[MQTT] Unsubscribed from topic "${topic}"`)
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
}

export default McpMqttClient