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

// Default MQTT broker configuration
export const defaultMqttConfig: MqttBrokerConfig = {
  brokerUrl: 'ws://broker.emqx.io:8083/mqtt',
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