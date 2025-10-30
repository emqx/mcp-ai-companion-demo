import { buildMqttWebSocketUrl } from '@/utils/host'

export interface MqttBrokerConfig {
  brokerUrl: string
  username: string
  password: string
  connectTimeout: number
  reconnectPeriod: number
  protocolVersion: 4 | 5
}

export interface McpMqttConfig extends MqttBrokerConfig {
  serverName: string
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface WebRTCMqttConfig extends MqttBrokerConfig {
  // WebRTC specific config can be added here
}

const asOptionalString = (value: string | undefined): string | undefined => {
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed.length ? trimmed : undefined
}

const parseNumberEnv = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback
  }
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

const resolveProtocolVersion = (value: string | undefined): 4 | 5 => {
  if (value?.trim() === '4') {
    return 4
  }
  return 5
}

const envBrokerUrl = asOptionalString(import.meta.env.VITE_MQTT_BROKER_URL)
const envUsername = asOptionalString(import.meta.env.VITE_MQTT_USERNAME)
const envPassword = asOptionalString(import.meta.env.VITE_MQTT_PASSWORD)
const envConnectTimeout = parseNumberEnv(import.meta.env.VITE_MQTT_CONNECT_TIMEOUT, 4000)
const envReconnectPeriod = parseNumberEnv(import.meta.env.VITE_MQTT_RECONNECT_PERIOD, 1000)
const envProtocolVersion = resolveProtocolVersion(import.meta.env.VITE_MQTT_PROTOCOL_VERSION)

// Default MQTT broker configuration
export const defaultMqttConfig: MqttBrokerConfig = {
  brokerUrl: envBrokerUrl ?? buildMqttWebSocketUrl('/mqtt'), // Auto-determines port based on protocol
  username: envUsername ?? 'emqx-mcp-webrtc-web-ui',
  password: envPassword ?? 'public',
  connectTimeout: envConnectTimeout,
  reconnectPeriod: envReconnectPeriod,
  protocolVersion: envProtocolVersion,
}

// MCP Server configuration
export const mcpServerConfig: McpMqttConfig = {
  ...defaultMqttConfig,
  serverName: 'web-ui-hardware-controller',
}

// WebRTC client configuration
export const webrtcClientConfig: WebRTCMqttConfig = {
  ...defaultMqttConfig,
  // WebRTC uses same broker but independent connection
}
