export interface MqttBrokerConfig {
  brokerUrl: string
  username: string
  password: string
  connectTimeout: number
  reconnectPeriod: number
  protocolVersion: 4 | 5
}

export interface McpMqttConfig extends MqttBrokerConfig {
  serverId: string
  serverName: string
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface WebRTCMqttConfig extends MqttBrokerConfig {
  // WebRTC specific config can be added here
}

// Helper function to get broker URL with current host
const getBrokerUrl = (url: string): string => {
  // If URL contains localhost, replace with current window host
  if (typeof window !== 'undefined' && url.includes('localhost')) {
    const urlObj = new URL(url)
    urlObj.hostname = window.location.hostname
    return urlObj.toString()
  }
  return url
}

// Default MQTT broker configuration
export const defaultMqttConfig: MqttBrokerConfig = {
  brokerUrl: getBrokerUrl('ws://localhost:8083/mqtt'),
  username: 'emqx-mcp-webrtc-web-ui',
  password: 'public',
  connectTimeout: 4000,
  reconnectPeriod: 1000,
  protocolVersion: 5
}

// MCP Server configuration
export const mcpServerConfig: McpMqttConfig = {
  ...defaultMqttConfig,
  serverId: 'web-ui-hardware-server',
  serverName: 'web-ui-hardware-controller'
}

// WebRTC client configuration  
export const webrtcClientConfig: WebRTCMqttConfig = {
  ...defaultMqttConfig,
  // WebRTC uses same broker but independent connection
}