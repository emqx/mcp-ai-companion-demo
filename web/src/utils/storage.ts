const MQTT_CONFIG_KEY = 'mcp-mqtt-config'
const ICE_SERVERS_CONFIG_KEY = 'mcp-ice-servers-config'

export interface MqttConfig {
  brokerUrl: string
  username: string
  password: string
  connectTimeout: number
  reconnectPeriod: number
}

export interface IceServersConfig {
  stunUrl?: string
  turnUrl?: string
  turnUsername?: string
  turnPassword?: string
}

export function saveMqttConfig(config: MqttConfig): void {
  try {
    localStorage.setItem(MQTT_CONFIG_KEY, JSON.stringify(config))
  } catch (error) {
    console.error('Failed to save MQTT config to localStorage:', error)
  }
}

export function loadMqttConfig(): MqttConfig | null {
  try {
    const saved = localStorage.getItem(MQTT_CONFIG_KEY)
    if (saved) {
      return JSON.parse(saved)
    }
  } catch (error) {
    console.error('Failed to load MQTT config from localStorage:', error)
  }
  return null
}

export function clearMqttConfig(): void {
  try {
    localStorage.removeItem(MQTT_CONFIG_KEY)
  } catch (error) {
    console.error('Failed to clear MQTT config from localStorage:', error)
  }
}

export function saveIceServersConfig(config: IceServersConfig): void {
  try {
    localStorage.setItem(ICE_SERVERS_CONFIG_KEY, JSON.stringify(config))
  } catch (error) {
    console.error('Failed to save ICE servers config to localStorage:', error)
  }
}

export function loadIceServersConfig(): IceServersConfig | null {
  try {
    const saved = localStorage.getItem(ICE_SERVERS_CONFIG_KEY)
    if (saved) {
      return JSON.parse(saved)
    }
  } catch (error) {
    console.error('Failed to load ICE servers config from localStorage:', error)
  }
  return null
}

export function clearIceServersConfig(): void {
  try {
    localStorage.removeItem(ICE_SERVERS_CONFIG_KEY)
  } catch (error) {
    console.error('Failed to clear ICE servers config from localStorage:', error)
  }
}
