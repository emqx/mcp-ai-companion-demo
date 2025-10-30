# MCP AI Companion Demo - Web UI

A React-based Web UI that implements an **MCP Server** over MQTT, providing hardware control capabilities (camera and emotion control) for AI agents to interact with.

## Features

- 🤖 **MCP Server Implementation** - Provides hardware control tools via MCP over MQTT protocol
- 📹 **Camera Control** - Enable/disable video feed through MCP tool calls
- 😊 **Emotion Control** - Change avatar emotions via MCP commands  
- 🎨 **Interactive UI** - Rive animations with emotion selector
- 🔊 **Audio Detection** - Real-time audio playing detection and UI feedback
- 📡 **WebRTC Support** - Video chat capabilities with signaling server

## Architecture

This Web UI acts as an **MCP Server** that exposes hardware control functionality to MCP Clients (like AI agents) over MQTT transport:

```shell
┌─────────────────┐    MQTT over WebSocket    ┌──────────────────┐
│   AI Agent      │ ──────────────────────────► │   Web UI         │
│   (MCP Client)  │ ◄────────────────────────── │   (MCP Server)   │
└─────────────────┘                            └──────────────────┘
         │                                              │
         └────────────────── MQTT Broker ──────────────┘
```

### Available MCP Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `control_camera` | Enable/disable video feed | `enabled: boolean` |
| `change_emotion` | Change avatar emotion | `emotion: string` |

## Tech Stack

- **React 19.1.1** with TypeScript
- **Vite 7.1.2** for build tooling
- **Tailwind CSS 4.1.12** for styling
- **MQTT.js** for MCP over MQTT protocol
- **Rive** for avatar animations
- **WebRTC** for real-time communication

## Setup

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build
```

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_AIGC_PROXY_HOST` | `http://localhost:3001` | Bun voice proxy (`volc-server`) address used to fetch scene config and Start/StopVoiceChat |

> If the Bun service runs on a different host or port, update this value in `.env`.

## AIGC Voice Proxy Integration

- `src/api/` wraps communication with the Bun `volc-server`:
  - `fetchScenes` -> `POST /getScenes`
  - `startVoiceChat` / `stopVoiceChat` -> `POST /proxy?Action=...`
- Type definitions live in `src/types/aigc.ts`; from there you can connect Zustand state and the UI.
- `src/lib/rtcClient.ts` wraps VolcEngine RTC SDK for WebRTC functionality.
- `src/hooks/useVolcRtc.ts` provides React hook for RTC operations.

After you start `volc-server`, you can verify with the following commands:

```bash
curl -X POST "$VITE_AIGC_PROXY_HOST/getScenes"
curl -X POST "$VITE_AIGC_PROXY_HOST/proxy?Action=StartVoiceChat" \
  -H 'Content-Type: application/json' \
  -d '{"SceneID":"emq-mcp-ai-companion"}'
```

## MCP over MQTT Integration

### Server Implementation

The Web UI implements an MCP Server using `McpMqttServer` class:

```typescript
// Initialize MCP Server with hardware control callbacks
const { isConnected, isMcpInitialized } = useMcpMqttServer({
  brokerUrl: 'ws://localhost:8083/mqtt',
  serverId: 'web-ui-hardware-server', 
  serverName: 'web-ui-hardware-controller',
  callbacks: {
    onCameraControl: (enabled: boolean) => setShowVideo(enabled),
    onEmotionChange: (emotion: string) => setSelectedEmotion(emotion)
  }
});
```

### Protocol Flow

1. **Service Discovery** - Server publishes presence notification
2. **Initialization** - Client sends initialize request  
3. **Tool Listing** - Client requests available tools
4. **Tool Execution** - Client calls hardware control tools

### Testing

Use the included test client to verify MCP functionality:

```bash
cd src/server
npm install
npm test

# Enable debug logging
DEBUG=true npm test
```

## Requirements

- **MQTT Broker** - EMQ X or compatible running on `ws://localhost:8083/mqtt`
- **Node.js ≥18.0.0** (for test client)
- **Modern Browser** with WebRTC support

## Development

```bash
# Start with hot reload
pnpm dev

# Run linting
pnpm lint

# Add shadcn/ui components
pnpm dlx shadcn@latest add <component-name>
```

## Related Projects

- **Backend API**: `/Users/ysfscream/Workspace/EMQ/emqx-multimedia-proxy` - Elixir/Phoenix multimedia processing server
- **MCP Client Test**: `src/server/` - Node.js reference implementation for testing

## Documentation

- [MCP over MQTT Implementation Guide](docs/mcp-over-mqtt-implementation.md) - Comprehensive implementation details
- [Test Client Documentation](src/server/README.md) - Node.js MCP Client reference and SDK design patterns
