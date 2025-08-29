# MCP Client Test

This directory contains a Node.js test client for testing the Web UI MCP Server implementation.

## Setup

```bash
cd src/server
npm install
```

## Usage

1. Make sure MQTT broker is running on `ws://localhost:8083/mqtt`
2. Start the Web UI (which runs the MCP Server)
3. Run the test client:

```bash
npm test
```

## What it tests

- Service discovery (listens for server presence notifications)
- Server initialization handshake
- Tools listing
- Tool execution (camera control and emotion change)

## Expected flow

1. Client connects to MQTT broker
2. Client subscribes to server presence notifications
3. When Web UI starts, it publishes presence notification
4. Client receives notification and initiates connection
5. Client sends initialize request
6. Server responds with capabilities
7. Client requests tools list
8. Server responds with available tools
9. Client tests each tool with sample parameters