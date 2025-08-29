import type { IClientOptions } from 'mqtt'

type MqttQoS = 0 | 1 | 2

export interface MqttConnectionOptions extends IClientOptions {
  brokerUrl?: string
  clientId?: string
}

export interface MqttMessage {
  topic: string
  payload: string
  qos: MqttQoS
  retain: boolean
}

// JSON-RPC 2.0 Types
export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: string | number
  method: string
  params?: Record<string, any>
}

export interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: string | number
  result?: any
  error?: {
    code: number
    message: string
    data?: any
  }
}

export interface JsonRpcNotification {
  jsonrpc: '2.0'
  method: string
  params?: Record<string, any>
}

// MCP Protocol Types - STANDARD ONLY
export interface McpTool {
  name: string
  description?: string
  inputSchema?: {
    type: 'object'
    properties?: Record<string, any>
    required?: string[]
  }
}

export interface McpCapabilities {
  tools?: {
    listChanged?: boolean
  }
  resources?: {
    subscribe?: boolean
    listChanged?: boolean
  }
  prompts?: {
    listChanged?: boolean
  }
  experimental?: Record<string, any>
}

export interface McpClientInfo {
  name: string
  version: string
}

export interface McpServerInfo {
  name: string
  version: string
}

// MCP Initialize Types
export interface McpInitializeRequest extends JsonRpcRequest {
  method: 'initialize'
  params: {
    protocolVersion: string
    capabilities: McpCapabilities
    clientInfo: McpClientInfo
  }
}

export interface McpInitializeResult {
  protocolVersion: string
  capabilities: McpCapabilities
  serverInfo: McpServerInfo
}

// MCP Tools Types
export interface McpToolsListRequest extends JsonRpcRequest {
  method: 'tools/list'
  params?: {
    cursor?: string
  }
}

export interface McpToolsListResult {
  tools: McpTool[]
  nextCursor?: string
}

export interface McpToolsCallRequest extends JsonRpcRequest {
  method: 'tools/call'
  params: {
    name: string
    arguments?: Record<string, any>
  }
}

export interface McpToolContent {
  type: 'text' | 'image' | 'resource'
  text?: string
  data?: string
  mimeType?: string
}

export interface McpToolsCallResult {
  content: McpToolContent[]
  isError?: boolean
}
