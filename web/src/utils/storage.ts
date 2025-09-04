const MQTT_CONFIG_KEY = 'mcp-mqtt-config'

export interface MqttConfig {
  brokerUrl: string
  username: string
  password: string
  connectTimeout: number
  reconnectPeriod: number
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
