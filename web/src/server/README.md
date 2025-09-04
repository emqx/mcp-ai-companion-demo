# MCP over MQTT JavaScript Implementation

This directory contains a Node.js MCP Client implementation for testing and demonstrating the MCP over MQTT protocol with the Web UI MCP Server.

## Overview

This implementation follows the [MCP over MQTT specification](https://mqtt.ai/docs/mcp-over-mqtt/) and provides a complete reference for building MCP Clients that communicate with MCP Servers over MQTT transport.

## Architecture

```shell
┌─────────────────┐    MQTT Topics    ┌──────────────────┐
│   MCP Client    │ ◄────────────────► │   MCP Server     │
│   (Node.js)     │                    │   (Web UI)       │
└─────────────────┘                    └──────────────────┘
         │                                       │
         └───────────── MQTT Broker ─────────────┘
```

### Components

- **MCP Client** (`mcp-client-test.js`) - Node.js implementation for testing
- **MCP Server** (`../lib/mcp-mqtt-server.ts`) - Web UI TypeScript implementation
- **MQTT Broker** - Message routing (EMQ X at `ws://localhost:8083/mqtt`)

## Setup

```bash
cd src/server

# Use Node.js v18+
nvm use

# Install dependencies
npm install
```

## Usage

### Basic Testing

```bash
npm test
```

### Debug Mode

```bash
DEBUG=true npm test
```

### Manual Tool Testing

After connection, use these interactive commands:

- `camera_on` - Enable camera
- `camera_off` - Disable camera
- `emotion <name>` - Change emotion (happy, sad, angry, etc.)
- `quit` - Exit

## MCP over MQTT Protocol Implementation

### 1. MQTT Topics Structure

Following the official specification:

| Topic Pattern | Direction | Purpose |
|---------------|-----------|---------|
| `$mcp-server/presence/{server-id}/{server-name}` | Server→All | Server presence notification |
| `$mcp-server/{server-id}/{server-name}` | Client→Server | Initialize requests |
| `$mcp-rpc/{client-id}/{server-id}/{server-name}` | Bidirectional | RPC requests/responses |

### 2. Message Format

All messages use JSON-RPC 2.0 format with MQTT 5.0 User Properties:

```javascript
// MQTT Message Properties
{
  properties: {
    userProperties: {
      'MCP-MQTT-CLIENT-ID': clientId,    // Required by spec
      'MCP-COMPONENT-TYPE': 'mcp-client' // Component identification
    }
  }
}

// JSON-RPC 2.0 Payload
{
  "jsonrpc": "2.0",
  "id": "unique-request-id",
  "method": "tools/call",
  "params": { ... }
}
```

### 3. Client Implementation Details

#### Connection and Discovery

```javascript
class McpMqttClient {
  async connect() {
    // 1. Connect to MQTT broker with MQTT 5.0
    this.mqttClient = mqtt.connect(brokerUrl, {
      protocolVersion: 5,
      properties: {
        userProperties: {
          'MCP-COMPONENT-TYPE': 'mcp-client'
        }
      }
    });

    // 2. Subscribe to server presence notifications
    await this.subscribe('$mcp-server/presence/+/+');
  }

  // 3. Auto-discover servers
  handleServerPresence(topic, data) {
    if (data.method === 'notifications/server/online') {
      const [, , serverId, serverName] = topic.split('/');
      this.initializeServer(serverId, serverName);
    }
  }
}
```

#### MCP Handshake Flow

```javascript
// 1. Initialize Server
async initializeServer(serverId, serverName) {
  // Subscribe to response topic first
  await this.subscribe(`$mcp-rpc/${this.clientId}/${serverId}/${serverName}`);

  const request = {
    jsonrpc: '2.0',
    id: generateId(),
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      clientInfo: { name: 'client-name', version: '1.0.0' }
    }
  };

  await this.publish(`$mcp-server/${serverId}/${serverName}`, request);
}

// 2. List Available Tools
async listTools(serverId, serverName) {
  const request = {
    jsonrpc: '2.0',
    id: generateId(),
    method: 'tools/list',
    params: {}
  };

  await this.publish(`$mcp-rpc/${this.clientId}/${serverId}/${serverName}`, request);
}

// 3. Call Tools
async callTool(toolName, args) {
  const request = {
    jsonrpc: '2.0',
    id: generateId(),
    method: 'tools/call',
    params: {
      name: toolName,
      arguments: args
    }
  };

  await this.publish(`$mcp-rpc/${this.clientId}/${serverId}/${serverName}`, request);
}
```

### 4. Error Handling

```javascript
// JSON-RPC Error Response Format
{
  "jsonrpc": "2.0",
  "id": "request-id",
  "error": {
    "code": -32000,
    "message": "Tool execution failed"
  }
}
```

### 5. Key Implementation Patterns

#### Message Publishing with User Properties

```javascript
async publish(topic, message, options = {}) {
  return this.mqttClient.publish(topic, message, {
    qos: options.qos || 0,
    retain: options.retain || false,
    properties: {
      userProperties: {
        'MCP-MQTT-CLIENT-ID': this.clientId  // Required by spec
      }
    }
  });
}
```

#### Asynchronous Request/Response Handling

```javascript
handleRpcResponse(topic, data) {
  if (data.result?.serverInfo) {
    // Handle initialize response
    this.listTools(serverId, serverName);
  } else if (data.result?.tools) {
    // Handle tools list response
    this.showAvailableTools(data.result.tools);
  } else {
    // Handle tool call response
    this.displayResult(data.result);
  }
}
```

## SDK Design Considerations

When creating an npm SDK based on this implementation:

### 1. Core Classes

```javascript
// Main client class
class McpMqttClient {
  constructor(options)
  async connect()
  async disconnect()
  async discoverServers()
  async initializeServer(serverId, serverName)
  async listTools(serverId, serverName)
  async callTool(serverId, serverName, toolName, args)
}

// Server registry
class McpServerRegistry {
  addServer(serverInfo)
  getServer(serverId, serverName)
  listServers()
}
```

### 2. Event-Driven API

```javascript
client.on('server:discovered', (serverInfo) => { ... });
client.on('server:initialized', (serverInfo) => { ... });
client.on('tools:listed', (serverId, serverName, tools) => { ... });
client.on('tool:result', (serverId, serverName, result) => { ... });
client.on('error', (error) => { ... });
```

### 3. Promise-Based Methods

```javascript
// Method chaining support
await client
  .connect()
  .then(() => client.discoverServers())
  .then((servers) => client.initializeServer(servers[0]))
  .then(() => client.listTools())
  .then((tools) => client.callTool('control_camera', { enabled: true }));
```

### 4. TypeScript Support

```typescript
interface McpClientOptions {
  brokerUrl: string;
  clientId?: string;
  autoConnect?: boolean;
  autoDiscover?: boolean;
  mqttOptions?: IClientOptions;
}

interface McpServerInfo {
  serverId: string;
  serverName: string;
  description?: string;
  capabilities?: McpCapabilities;
}
```

## Testing Flow

1. **Server Discovery** - Client discovers Web UI MCP Server
2. **Handshake** - Initialize connection and exchange capabilities
3. **Tool Listing** - Retrieve available hardware control tools
4. **Interactive Testing** - Manual tool execution with real-time feedback

## Available Tools

The Web UI MCP Server provides these hardware control tools:

| Tool | Description | Parameters |
|------|-------------|------------|
| `control_camera` | Enable/disable video feed | `enabled: boolean` |
| `change_emotion` | Change avatar emotion | `emotion: string` (happy, sad, angry, etc.) |

## Requirements

- Node.js ≥18.0.0
- MQTT 5.0 broker with WebSocket support
- Active Web UI MCP Server instance
