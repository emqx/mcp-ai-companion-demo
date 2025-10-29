# WebRTC over MQTT Integration Guide

## Overview

This project implements a complete WebRTC over MQTT integration, using MQTT as the signaling channel to enable audio and video communication between browsers and the backend.

## Implementation Principles

### WebRTC Fundamentals

WebRTC (Web Real-Time Communication) is an open standard that allows peer-to-peer audio and video communication between browsers. However, establishing WebRTC connections requires a signaling exchange process:

1. **Signaling**: Exchange SDP (Session Description Protocol) and ICE (Interactive Connectivity Establishment) candidates
2. **NAT Traversal**: Handle network address translation through STUN/TURN servers
3. **Media Transmission**: Establish direct P2P connections for audio/video data transmission

### Advantages of MQTT as Signaling Channel

Traditional WebRTC signaling typically uses WebSocket, but using MQTT offers the following advantages:

1. **Low Latency**: MQTT protocol is designed for IoT with lower latency
2. **Reliability**: Supports QoS guarantees and message retransmission
3. **Scalability**: Broker architecture supports large-scale device connections
4. **Unified Protocol**: Shares the same infrastructure with MCP over MQTT

### Signaling Exchange Flow

```mermaid
sequenceDiagram
    participant Browser as Browser
    participant MQTT as MQTT Broker
    participant Backend as Backend Service

    Browser->>MQTT: 1. Connect to MQTT (ws://localhost:8083)
    Backend->>MQTT: 2. Connect to MQTT (tcp://localhost:1883)

    Browser->>MQTT: 3. Subscribe to $webrtc/{client-id}
    Backend->>MQTT: 4. Subscribe to $webrtc/+/multimedia_proxy

    Browser->>Browser: 5. getUserMedia() get camera/microphone
    Browser->>Browser: 6. Create RTCPeerConnection
    Browser->>Browser: 7. createOffer() generate SDP offer
    Browser->>MQTT: 8. Publish offer to $webrtc/{client-id}/multimedia_proxy

    MQTT->>Backend: 9. Forward offer
    Backend->>Backend: 10. Create WebRTC pipeline
    Backend->>Backend: 11. createAnswer() generate SDP answer
    Backend->>MQTT: 12. Publish answer to $webrtc/{client-id}

    MQTT->>Browser: 13. Forward answer
    Browser->>Browser: 14. setRemoteDescription(answer)

    Note over Browser,Backend: ICE candidate exchange
    Browser->>MQTT: 15. Publish ICE candidates
    Backend->>MQTT: 16. Publish ICE candidates

    Note over Browser,Backend: WebRTC connection established
    Browser<-->Backend: 17. Direct P2P audio/video transmission
```

### Dual Protocol Architecture

The project uses a dual protocol design to avoid protocol conflicts:

#### MCP over MQTT Protocol Stack

```shell
Application Layer: Hardware control commands (Camera ON/OFF, Emotion Change)
Protocol Layer: MCP (Model Context Protocol)
Transport Layer: MQTT 5.0 with User Properties
Network Layer: WebSocket (ws://localhost:8083/mqtt)
```

#### WebRTC over MQTT Protocol Stack

```shell
Application Layer: Audio/video data streams
Protocol Layer: WebRTC (SDP/ICE signaling)
Transport Layer: MQTT 5.0 (pure message passing)
Network Layer: WebSocket (ws://localhost:8083/mqtt)
```

### Connection Management

#### Independent Connection Design

Each protocol uses an independent MQTT client connection:

```typescript
// MCP connection
const mcpClient = mqtt.connect(brokerUrl, {
  clientId: 'mcp-ai-web-ui-random',
  protocolVersion: 5,
  properties: {
    userProperties: {
      'MCP-COMPONENT-TYPE': 'mcp-client'
    }
  }
})

// WebRTC connection
const webrtcClient = mqtt.connect(brokerUrl, {
  clientId: 'webrtc_client_random',
  protocolVersion: 5,
  // No special properties, standard MQTT connection
})
```

#### Lifecycle Management

Using React Hooks pattern to manage connection lifecycle:

1. **Initialization Phase**: Create MQTT client and WebRTC peer connection
2. **Connection Phase**: Establish MQTT connection, subscribe to necessary topics
3. **Signaling Phase**: Exchange SDP and ICE candidates
4. **Communication Phase**: P2P audio/video transmission
5. **Cleanup Phase**: Disconnect all connections, release media resources

### Key Technical Principles

#### 1. MQTT 5.0 Protocol Features

- **User Properties**: MCP uses custom properties to identify component types
- **Clean Session**: Ensures clean connections without preserving session state
- **Will Message**: Last will message sent when connection unexpectedly disconnects
- **Retain Flag**: MCP server online notifications use retain to ensure newly connected clients receive them

#### 2. WebRTC Signaling Synchronization

- **Asynchronous Signaling**: offer/answer exchanged asynchronously via MQTT
- **ICE Collection**: Immediately send via MQTT when onicecandidate event triggers
- **State Synchronization**: Connection state changes synchronized to React state via callbacks

#### 3. Media Stream Processing

```typescript
// Local stream acquisition
const localStream = await navigator.mediaDevices.getUserMedia(constraints)

// Add to peer connection
for (const track of localStream.getTracks()) {
  pc.addTrack(track, localStream)
}

// Receive remote stream
pc.ontrack = (event) => {
  const remoteStream = new MediaStream()
  remoteStream.addTrack(event.track)
}
```

#### 4. React State Management

- **useRef**: Store immutable connection instances, avoid repeated creation
- **useState**: Manage connection state and error state
- **useCallback**: Cache functions, avoid unnecessary re-renders
- **useEffect**: Handle side effects and cleanup logic

#### 5. Error Handling and Reconnection

```typescript
// MQTT automatic reconnection
reconnectPeriod: 1000, // Reconnect after 1 second

// WebRTC connection failure handling
pc.onconnectionstatechange = () => {
  if (pc.connectionState === 'failed') {
    // Trigger reconnection
    this.handleError(new Error('Connection failed'))
  }
}

// Timeout protection
const timeoutPromise = new Promise((_, reject) =>
  setTimeout(() => reject(new Error('Operation timeout')), 5000)
)
await Promise.race([operation, timeoutPromise])
```

## Architecture Design

### Dual Protocol System

The project simultaneously runs two independent MQTT connections:

1. **MCP over MQTT** - For hardware control (camera, emotion switching)
2. **WebRTC over MQTT** - For audio/video stream transmission signaling

### System Components

```shell
Frontend (React)
├── MCP MQTT Client (useMcpMqttServer)
│   ├── Topics: $mcp-server/{server-id}/{server-name}
│   └── Functions: Hardware control, tool invocation
└── WebRTC MQTT Client (useWebRTCMqtt)
    ├── Subscribes: $webrtc/{client-id}
    ├── Publishes: $webrtc/{client-id}/multimedia_proxy
    └── Functions: Audio/video signaling exchange
```

## Configuration System

### Unified Configuration File (`src/config/mqtt.ts`)

```typescript
// Basic MQTT configuration
export const defaultMqttConfig = {
  brokerUrl: 'ws://localhost:8083/mqtt',
  username: 'emqx-mcp-webrtc-web-ui',
  password: 'public',
  connectTimeout: 4000,
  reconnectPeriod: 1000,
  protocolVersion: 5
}

// MCP server configuration
export const mcpServerConfig = {
  ...defaultMqttConfig,
  serverId: 'web-ui-hardware-server',
  serverName: 'web-ui-hardware-controller'
}

// WebRTC client configuration
export const webrtcClientConfig = {
  ...defaultMqttConfig
  // Use same broker, independent connection
}
```

## WebRTC Integration Usage

### 1. Hook Usage (`useWebRTCMqtt`)

```typescript
import { useWebRTCMqtt } from '@/hooks/useWebRTCMqtt'

const {
  localStream,           // Local media stream
  remoteStream,          // Remote media stream
  connectionState,       // Connection state
  mqttConnected,        // MQTT connection state
  isConnecting,         // Is connecting
  isConnected,          // Is connected
  error,                // Error information
  connect,              // Connect function
  disconnect,           // Disconnect function
  toggleAudio,          // Audio toggle
  toggleVideo,          // Video toggle
  isAudioEnabled,       // Audio state
  isVideoEnabled        // Video state
} = useWebRTCMqtt({
  autoConnect: false,   // Manual connection control
  onASRResponse: (text) => console.log('ASR:', text)
})
```

### 2. Connection Flow

```typescript
// 1. Ensure MQTT connection is successful
if (isMqttConnected) {
  // 2. Start WebRTC connection
  await connect()

  // 3. Connection state monitoring
  useEffect(() => {
    if (isConnected) {
      console.log('WebRTC connection successful')
    }
  }, [isConnected])
}
```

### 3. Media Stream Handling

```typescript
// Local stream (camera/microphone)
useEffect(() => {
  if (localStream && localVideoRef.current) {
    localVideoRef.current.srcObject = localStream
  }
}, [localStream])

// Remote stream (from backend)
useEffect(() => {
  if (remoteStream) {
    if (audioRef.current) {
      audioRef.current.srcObject = remoteStream
    }
    if (showVideo && videoRef.current) {
      videoRef.current.srcObject = remoteStream
    }
  }
}, [remoteStream, showVideo])
```

## MQTT Topic Specifications

### WebRTC Signaling Topics

| Topic Type | Format | Direction | Description |
|------------|-------|-----------|-------------|
| Receive Signaling | `$webrtc/{client-id}` | Backend→Frontend | Receive answer, ICE candidates |
| Send Signaling | `$webrtc/{client-id}/multimedia_proxy` | Frontend→Backend | Send offer, ICE candidates |
| ASR/TTS | `$message/{client-id}` | Bidirectional | Speech recognition and synthesis messages |

### Signaling Message Formats

```typescript
// SDP Offer
{
  type: "sdp_offer",
  data: {
    sdp: "<SDP payload>",
    type: "offer"
  }
}

// SDP Answer
{
  type: "sdp_answer",
  data: {
    sdp: "<SDP payload>",
    type: "answer"
  }
}

// ICE Candidate
{
  type: "ice_candidate",
  data: {
    candidate: "<candidate string>",
    sdpMid: "<sdpMid>",
    sdpMLineIndex: 0
  }
}

// Connection Termination
{
  type: "webrtc_terminated",
  reason: "<termination reason>"
}
```

## Logging System

### Log Categories

```typescript
import { webrtcLogger, mqttLogger, mcpLogger, appLogger } from '@/utils/logger'

// WebRTC related logs
webrtcLogger.info('🎥 WebRTC connected')

// MQTT connection logs
mqttLogger.info('📡 MQTT connected')

// MCP protocol logs
mcpLogger.info('🚀 MCP Server ready')

// Application layer logs
appLogger.info('✅ System ready')
```

### Connection Process Tracking

WebRTC connections show detailed step logs:

```shell
📡 WebRTC: Step 1/2 - Establishing MQTT connection
✅ WebRTC: MQTT connected (ClientID: webrtc_client_abc123)
🎥 WebRTC: Step 2/2 - Starting WebRTC signaling
📡 Subscribing to topics: $webrtc/webrtc_client_abc123, $message/webrtc_client_abc123
✅ Subscribed to WebRTC topics
📤 Creating and sending offer to backend
✅ Offer created, setting as local description
📡 Offer sent to backend, waiting for answer...
📨 Received sdp_answer from $webrtc/webrtc_client_abc123
✅ WebRTC connection established
```

## Component Integration Examples

### App.tsx Integration

```typescript
function App() {
  // MCP server (hardware control)
  const { isConnected: isMqttConnected, isMcpInitialized } = useMcpMqttServer({
    autoConnect: true
  })

  // WebRTC client (audio/video)
  const {
    remoteStream,
    mqttConnected: isWebRTCMqttConnected,
    isConnected: isWebRTCConnected,
    connect: connectWebRTC,
    disconnect: disconnectWebRTC,
    toggleAudio,
    toggleVideo
  } = useWebRTCMqtt({
    autoConnect: false
  })

  return (
    <ChatInterface
      webrtc={{
        remoteStream,
        isConnected: isWebRTCConnected,
        connect: connectWebRTC,
        disconnect: disconnectWebRTC,
        toggleAudio,
        toggleVideo
      }}
      isMqttConnected={isMqttConnected}
    />
  )
}
```

### ChatInterface Component

```typescript
interface ChatInterfaceProps {
  webrtc: WebRTCState & WebRTCActions
  isMqttConnected: boolean
}

export function ChatInterface({ webrtc, isMqttConnected }) {
  const handleConnect = () => {
    if (isMqttConnected && !webrtc.isConnected) {
      webrtc.connect()
    }
  }

  const handleRecord = () => {
    if (webrtc.isConnected) {
      webrtc.toggleAudio(true)
    }
  }

  return (
    <div>
      <button onClick={handleConnect}>Connect</button>
      <button onClick={handleRecord}>Record</button>
      <video ref={videoRef} />
      <audio ref={audioRef} />
    </div>
  )
}
```

## Error Handling and Debugging

### Common Issues

1. **MQTT Connection Failure**
   - Check broker URL and authentication information
   - Confirm firewall ports are open

2. **WebRTC Signaling Failure**
   - Check browser network panel
   - Verify MQTT topic subscription status

3. **Media Stream Acquisition Failure**
   - Confirm browser permission settings
   - Check device access permissions

### Debugging Tips

```typescript
// Enable detailed logging
webrtcLogger.setEnabled(true)
mqttLogger.setEnabled(true)

// Monitor connection state changes
useEffect(() => {
  console.log('Connection state:', connectionState)
  if (error) {
    console.error('WebRTC error:', error)
  }
}, [connectionState, error])
```

## Disconnection and Cleanup

The system provides a complete resource cleanup mechanism:

```typescript
// Manual disconnection
disconnect()

// Automatic cleanup on component unmount
useEffect(() => {
  return () => {
    // Automatically clean up all connections and media streams
  }
}, [])
```

Cleanup process includes:

- 🎥 Stop local media stream
- 📺 Stop remote media stream
- 🔗 Close WebRTC connection
- 📡 Cancel MQTT topic subscriptions
- 🔌 Disconnect MQTT client
- 🧹 Reset all states

## Performance Optimization

1. **Independent Connections** - MCP and WebRTC use independent MQTT connections to avoid protocol conflicts
2. **Smart Reconnection** - Automatic reconnection mechanism that recovers when connection is interrupted
3. **Resource Management** - Comprehensive cleanup mechanism prevents memory leaks
4. **Log Optimization** - Tiered logging system allows disabling detailed logs in production

## Technical Implementation Details

### 1. Asynchronous Programming Pattern

The system extensively uses Promise and async/await to handle asynchronous operations:

```typescript
// MQTT connection wrapped as Promise
const connectMqtt = async (): Promise<void> => {
  return new Promise((resolve, reject) => {
    const client = mqtt.connect(brokerUrl, options)
    client.on('connect', resolve)
    client.on('error', reject)
  })
}

// WebRTC operations are also asynchronous
const offer = await pc.createOffer()
await pc.setLocalDescription(offer)
```

### 2. Event-Driven Architecture

The system uses an event-driven pattern, decoupling components through callbacks:

```typescript
// MQTT event handling
mqttClient.on('message', (topic, payload) => {
  const message = JSON.parse(payload.toString())
  this.handleSignalingMessage(topic, message)
})

// WebRTC event handling
pc.onicecandidate = (event) => {
  if (event.candidate) {
    this.sendSignal('ice_candidate', event.candidate)
  }
}

// React callback passing
const callbacks = {
  onConnectionStateChange: setConnectionState,
  onLocalStream: setLocalStream,
  onRemoteStream: setRemoteStream
}
```

### 3. Type Safety Design

Using TypeScript to ensure type safety:

```typescript
// Strict interface definitions
interface SignalingMessage {
  type: 'sdp_offer' | 'sdp_answer' | 'ice_candidate' | 'webrtc_terminated'
  data?: any
  reason?: string
}

// Union types ensure state consistency
type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'failed' | 'closed'

// Generic constraints
interface UseWebRTCReturn {
  localStream: MediaStream | null
  remoteStream: MediaStream | null
  connectionState: ConnectionState
}
```

### 4. Memory Management and Resource Cleanup

```typescript
// Media stream cleanup
localStream?.getTracks().forEach(track => {
  track.stop()           // Stop hardware access
  track.enabled = false  // Disable track
})

// MQTT connection cleanup
mqttClient.removeListener('message', handler)  // Remove listeners
mqttClient.unsubscribe(topics)                // Unsubscribe
mqttClient.end(true)                          // Force disconnect

// WebRTC connection cleanup
pc.close()              // Close peer connection
pc = null              // Release reference
```

### 5. Concurrency Control

```typescript
// Use ref to prevent race conditions
const hasConnectedRef = useRef(false)

if (!hasConnectedRef.current) {
  hasConnectedRef.current = true
  connect()
}

// Connection state check
if (!this.mqttClient?.connected) {
  throw new Error('MQTT not connected')
}
```

## Backend Integration Requirements

### MQTT Broker Configuration

- **Protocol Version**: MQTT 5.0
- **Port Configuration**:
  - TCP: 1883 (backend connection)
  - WebSocket: 8083 (frontend connection)
- **Authentication**: username/password = emqx-mcp-webrtc-web-ui/public

### WebRTC Backend Implementation

- **Signaling Handling**: Listen to `$webrtc/+/multimedia_proxy` topic
- **SDP Processing**: Receive offer, generate and send answer
- **ICE Processing**: Collect and exchange ICE candidates
- **Media Processing**: Establish WebRTC pipeline, handle audio/video streams
- **ASR/TTS**: Handle speech through `$message/{client-id}` topic

### Backend Response Format

```elixir
# Elixir backend example
def handle_webrtc_offer(client_id, offer) do
  # Create WebRTC pipeline
  pipeline = create_webrtc_pipeline(offer)

  # Generate answer
  answer = generate_answer(pipeline)

  # Send to frontend
  topic = "$webrtc/#{client_id}"
  message = %{type: "sdp_answer", data: answer}
  :emqtt.publish(client, topic, Jason.encode!(message))
end
```

## Debugging and Monitoring

### Development Environment Debugging

1. **EMQX Dashboard**: <http://localhost:18083> monitor MQTT connections
2. **Browser Console**: View detailed categorized logs
3. **Chrome DevTools**: WebRTC internals (chrome://webrtc-internals)
4. **Network Tab**: Monitor WebSocket connection status

### Production Environment Monitoring

- MQTT connection status monitoring
- WebRTC connection success rate statistics
- Audio/video quality metrics
- Error log aggregation and analysis
