# WebRTC over MQTT Integration Guide

## 概述

本项目实现了 WebRTC over MQTT 的完整集成，通过 MQTT 作为信令通道，实现浏览器与后端的音视频通信。

## 实现原理

### WebRTC 基础原理

WebRTC (Web Real-Time Communication) 是一个开放标准，允许浏览器之间进行点对点的音视频通信。但 WebRTC 建立连接需要信令交换过程：

1. **信令交换 (Signaling)**：交换 SDP (Session Description Protocol) 和 ICE (Interactive Connectivity Establishment) 候选者
2. **NAT 穿透**：通过 STUN/TURN 服务器处理网络地址转换
3. **媒体传输**：建立直接的 P2P 连接传输音视频数据

### MQTT 作为信令通道的优势

传统的 WebRTC 信令通常使用 WebSocket，但使用 MQTT 有以下优势：

1. **低延迟**：MQTT 协议专为物联网设计，延迟更低
2. **可靠性**：支持 QoS 质量保证和消息重传
3. **扩展性**：broker 架构支持大规模设备连接
4. **统一协议**：与 MCP over MQTT 共用同一套基础设施

### 信令交换流程

```mermaid
sequenceDiagram
    participant Browser as 浏览器
    participant MQTT as MQTT Broker
    participant Backend as 后端服务
    
    Browser->>MQTT: 1. 连接 MQTT (ws://localhost:8083)
    Backend->>MQTT: 2. 连接 MQTT (tcp://localhost:1883)
    
    Browser->>MQTT: 3. 订阅 $webrtc/{client-id}
    Backend->>MQTT: 4. 订阅 $webrtc/+/multimedia_proxy
    
    Browser->>Browser: 5. getUserMedia() 获取摄像头/麦克风
    Browser->>Browser: 6. 创建 RTCPeerConnection
    Browser->>Browser: 7. createOffer() 生成 SDP offer
    Browser->>MQTT: 8. 发布 offer 到 $webrtc/{client-id}/multimedia_proxy
    
    MQTT->>Backend: 9. 转发 offer
    Backend->>Backend: 10. 创建 WebRTC pipeline
    Backend->>Backend: 11. createAnswer() 生成 SDP answer
    Backend->>MQTT: 12. 发布 answer 到 $webrtc/{client-id}
    
    MQTT->>Browser: 13. 转发 answer
    Browser->>Browser: 14. setRemoteDescription(answer)
    
    Note over Browser,Backend: ICE 候选者交换
    Browser->>MQTT: 15. 发布 ICE candidates
    Backend->>MQTT: 16. 发布 ICE candidates
    
    Note over Browser,Backend: WebRTC 连接建立
    Browser<-->Backend: 17. 直接 P2P 音视频传输
```

### 双协议架构原理

项目采用双协议设计，避免协议冲突：

#### MCP over MQTT 协议栈

```shell
应用层: 硬件控制命令 (Camera ON/OFF, Emotion Change)
协议层: MCP (Model Context Protocol) 
传输层: MQTT 5.0 with User Properties
网络层: WebSocket (ws://localhost:8083/mqtt)
```

#### WebRTC over MQTT 协议栈  

```shell
应用层: 音视频数据流
协议层: WebRTC (SDP/ICE signaling)
传输层: MQTT 5.0 (纯消息传递)
网络层: WebSocket (ws://localhost:8083/mqtt)
```

### 连接管理原理

#### 独立连接设计

每个协议使用独立的 MQTT 客户端连接：

```typescript
// MCP 连接
const mcpClient = mqtt.connect(brokerUrl, {
  clientId: 'mcp-ai-web-ui-random',
  protocolVersion: 5,
  properties: {
    userProperties: {
      'MCP-COMPONENT-TYPE': 'mcp-client'
    }
  }
})

// WebRTC 连接
const webrtcClient = mqtt.connect(brokerUrl, {
  clientId: 'webrtc_client_random',
  protocolVersion: 5,
  // 无特殊属性，标准 MQTT 连接
})
```

#### 生命周期管理

使用 React Hooks 模式管理连接生命周期：

1. **初始化阶段**：创建 MQTT 客户端和 WebRTC peer connection
2. **连接阶段**：建立 MQTT 连接，订阅必要主题
3. **信令阶段**：交换 SDP 和 ICE 候选者
4. **通信阶段**：P2P 音视频传输
5. **清理阶段**：断开所有连接，释放媒体资源

### 关键技术原理

#### 1. MQTT 5.0 协议特性

- **User Properties**：MCP 使用自定义属性标识组件类型
- **Clean Session**：确保连接干净，不保留会话状态
- **Will Message**：连接意外断开时的遗言消息
- **Retain Flag**：MCP 服务器在线通知使用 retain 确保新连接的客户端能收到

#### 2. WebRTC 信令同步机制

- **异步信令**：offer/answer 通过 MQTT 异步交换
- **ICE 收集**：onicecandidate 事件触发后立即通过 MQTT 发送
- **状态同步**：connection state 变化通过回调同步到 React 状态

#### 3. 媒体流处理原理

```typescript
// 本地流获取
const localStream = await navigator.mediaDevices.getUserMedia(constraints)

// 添加到 peer connection
for (const track of localStream.getTracks()) {
  pc.addTrack(track, localStream)
}

// 接收远程流
pc.ontrack = (event) => {
  const remoteStream = new MediaStream()
  remoteStream.addTrack(event.track)
}
```

#### 4. React 状态管理原理

- **useRef**：存储不变的连接实例，避免重复创建
- **useState**：管理连接状态和错误状态
- **useCallback**：缓存函数，避免不必要的重新渲染
- **useEffect**：处理副作用和清理逻辑

#### 5. 错误处理和重连机制

```typescript
// MQTT 自动重连
reconnectPeriod: 1000, // 1秒后重连

// WebRTC 连接失败处理
pc.onconnectionstatechange = () => {
  if (pc.connectionState === 'failed') {
    // 触发重新建立连接
    this.handleError(new Error('Connection failed'))
  }
}

// 超时保护
const timeoutPromise = new Promise((_, reject) => 
  setTimeout(() => reject(new Error('Operation timeout')), 5000)
)
await Promise.race([operation, timeoutPromise])
```

## 架构设计

### 双协议系统

项目同时运行两个独立的 MQTT 连接：

1. **MCP over MQTT** - 用于硬件控制（摄像头、表情切换）
2. **WebRTC over MQTT** - 用于音视频流传输信令

### 系统组件

```shell
Frontend (React)
├── MCP MQTT Client (useMcpMqttServer)
│   ├── 主题: $mcp-server/{server-id}/{server-name}
│   └── 功能: 硬件控制、工具调用
└── WebRTC MQTT Client (useWebRTCMqtt)
    ├── 订阅: $webrtc/{client-id}
    ├── 发布: $webrtc/{client-id}/multimedia_proxy
    └── 功能: 音视频信令交换
```

## 配置系统

### 统一配置文件 (`src/config/mqtt.ts`)

```typescript
// 基础 MQTT 配置
export const defaultMqttConfig = {
  brokerUrl: 'ws://localhost:8083/mqtt',
  username: 'emqx-mcp-webrtc-web-ui',
  password: 'public',
  connectTimeout: 4000,
  reconnectPeriod: 1000,
  protocolVersion: 5
}

// MCP 服务器配置
export const mcpServerConfig = {
  ...defaultMqttConfig,
  serverId: 'web-ui-hardware-server',
  serverName: 'web-ui-hardware-controller'
}

// WebRTC 客户端配置
export const webrtcClientConfig = {
  ...defaultMqttConfig
  // 使用相同 broker，独立连接
}
```

## WebRTC 集成使用

### 1. Hook 使用 (`useWebRTCMqtt`)

```typescript
import { useWebRTCMqtt } from '@/hooks/useWebRTCMqtt'

const {
  localStream,           // 本地媒体流
  remoteStream,          // 远程媒体流
  connectionState,       // 连接状态
  mqttConnected,        // MQTT 连接状态
  isConnecting,         // 是否连接中
  isConnected,          // 是否已连接
  error,                // 错误信息
  connect,              // 连接函数
  disconnect,           // 断开函数
  toggleAudio,          // 音频开关
  toggleVideo,          // 视频开关
  isAudioEnabled,       // 音频状态
  isVideoEnabled        // 视频状态
} = useWebRTCMqtt({
  autoConnect: false,   // 手动控制连接
  onASRResponse: (text) => console.log('ASR:', text)
})
```

### 2. 连接流程

```typescript
// 1. 确保 MQTT 连接成功
if (isMqttConnected) {
  // 2. 启动 WebRTC 连接
  await connect()
  
  // 3. 连接状态监听
  useEffect(() => {
    if (isConnected) {
      console.log('WebRTC 连接成功')
    }
  }, [isConnected])
}
```

### 3. 媒体流处理

```typescript
// 本地流（摄像头/麦克风）
useEffect(() => {
  if (localStream && localVideoRef.current) {
    localVideoRef.current.srcObject = localStream
  }
}, [localStream])

// 远程流（来自后端）
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

## MQTT 主题规范

### WebRTC 信令主题

| 主题类型 | 格式 | 方向 | 说明 |
|---------|------|------|------|
| 接收信令 | `$webrtc/{client-id}` | Backend→Frontend | 接收 answer、ICE candidates |
| 发送信令 | `$webrtc/{client-id}/multimedia_proxy` | Frontend→Backend | 发送 offer、ICE candidates |
| ASR/TTS | `$message/{client-id}` | 双向 | 语音识别和合成消息 |

### 信令消息格式

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

// 连接终止
{
  type: "webrtc_terminated",
  reason: "<termination reason>"
}
```

## 日志系统

### 日志分类

```typescript
import { webrtcLogger, mqttLogger, mcpLogger, appLogger } from '@/utils/logger'

// WebRTC 相关日志
webrtcLogger.info('🎥 WebRTC connected')

// MQTT 连接日志  
mqttLogger.info('📡 MQTT connected')

// MCP 协议日志
mcpLogger.info('🚀 MCP Server ready')

// 应用层日志
appLogger.info('✅ System ready')
```

### 连接过程追踪

WebRTC 连接会显示详细的步骤日志：

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

## 组件集成示例

### App.tsx 集成

```typescript
function App() {
  // MCP 服务器（硬件控制）
  const { isConnected: isMqttConnected, isMcpInitialized } = useMcpMqttServer({
    autoConnect: true
  })

  // WebRTC 客户端（音视频）
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

### ChatInterface 组件

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
      <button onClick={handleConnect}>连接</button>
      <button onClick={handleRecord}>录音</button>
      <video ref={videoRef} />
      <audio ref={audioRef} />
    </div>
  )
}
```

## 错误处理和调试

### 常见问题

1. **MQTT 连接失败**
   - 检查 broker URL 和认证信息
   - 确认防火墙端口开放

2. **WebRTC 信令失败**
   - 查看浏览器网络面板
   - 检查 MQTT 主题订阅状态

3. **媒体流获取失败**
   - 确认浏览器权限设置
   - 检查设备访问权限

### 调试技巧

```typescript
// 启用详细日志
webrtcLogger.setEnabled(true)
mqttLogger.setEnabled(true)

// 监听连接状态变化
useEffect(() => {
  console.log('Connection state:', connectionState)
  if (error) {
    console.error('WebRTC error:', error)
  }
}, [connectionState, error])
```

## 断开和清理

系统提供完整的资源清理机制：

```typescript
// 手动断开
disconnect()

// 组件卸载时自动清理
useEffect(() => {
  return () => {
    // 自动清理所有连接和媒体流
  }
}, [])
```

清理过程包括：

- 🎥 停止本地媒体流
- 📺 停止远程媒体流  
- 🔗 关闭 WebRTC 连接
- 📡 取消 MQTT 主题订阅
- 🔌 断开 MQTT 客户端
- 🧹 重置所有状态

## 性能优化

1. **独立连接** - MCP 和 WebRTC 使用独立的 MQTT 连接，避免协议冲突
2. **智能重连** - 自动重连机制，连接中断时自动恢复
3. **资源管理** - 完善的清理机制，防止内存泄漏
4. **日志优化** - 分级日志系统，生产环境可关闭详细日志

## 技术实现细节

### 1. 异步编程模式

整个系统大量使用 Promise 和 async/await 来处理异步操作：

```typescript
// MQTT 连接封装为 Promise
const connectMqtt = async (): Promise<void> => {
  return new Promise((resolve, reject) => {
    const client = mqtt.connect(brokerUrl, options)
    client.on('connect', resolve)
    client.on('error', reject)
  })
}

// WebRTC 操作也是异步的
const offer = await pc.createOffer()
await pc.setLocalDescription(offer)
```

### 2. 事件驱动架构

系统采用事件驱动模式，通过回调函数解耦组件：

```typescript
// MQTT 事件处理
mqttClient.on('message', (topic, payload) => {
  const message = JSON.parse(payload.toString())
  this.handleSignalingMessage(topic, message)
})

// WebRTC 事件处理
pc.onicecandidate = (event) => {
  if (event.candidate) {
    this.sendSignal('ice_candidate', event.candidate)
  }
}

// React 回调传递
const callbacks = {
  onConnectionStateChange: setConnectionState,
  onLocalStream: setLocalStream,
  onRemoteStream: setRemoteStream
}
```

### 3. 类型安全设计

使用 TypeScript 确保类型安全：

```typescript
// 严格的接口定义
interface SignalingMessage {
  type: 'sdp_offer' | 'sdp_answer' | 'ice_candidate' | 'webrtc_terminated'
  data?: any
  reason?: string
}

// 联合类型保证状态一致性
type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'failed' | 'closed'

// 泛型约束
interface UseWebRTCReturn {
  localStream: MediaStream | null
  remoteStream: MediaStream | null
  connectionState: ConnectionState
}
```

### 4. 内存管理和资源清理

```typescript
// 媒体流清理
localStream?.getTracks().forEach(track => {
  track.stop()           // 停止硬件访问
  track.enabled = false  // 禁用轨道
})

// MQTT 连接清理
mqttClient.removeListener('message', handler)  // 移除监听器
mqttClient.unsubscribe(topics)                // 取消订阅
mqttClient.end(true)                          // 强制断开

// WebRTC 连接清理
pc.close()              // 关闭 peer connection
pc = null              // 释放引用
```

### 5. 并发控制

```typescript
// 使用 ref 防止竞态条件
const hasConnectedRef = useRef(false)

if (!hasConnectedRef.current) {
  hasConnectedRef.current = true
  connect()
}

// 连接状态检查
if (!this.mqttClient?.connected) {
  throw new Error('MQTT not connected')
}
```

## 后端集成要求

### MQTT Broker 配置

- **协议版本**：MQTT 5.0
- **端口配置**：
  - TCP: 1883 (后端连接)
  - WebSocket: 8083 (前端连接)
- **认证**：username/password = emqx-mcp-webrtc-web-ui/public

### WebRTC 后端实现

- **信令处理**：监听 `$webrtc/+/multimedia_proxy` 主题
- **SDP 处理**：接收 offer，生成并发送 answer
- **ICE 处理**：收集和交换 ICE candidates
- **媒体处理**：建立 WebRTC pipeline，处理音视频流
- **ASR/TTS**：通过 `$message/{client-id}` 主题处理语音

### 后端响应格式

```elixir
# Elixir 后端示例
def handle_webrtc_offer(client_id, offer) do
  # 创建 WebRTC pipeline
  pipeline = create_webrtc_pipeline(offer)
  
  # 生成 answer
  answer = generate_answer(pipeline)
  
  # 发送到前端
  topic = "$webrtc/#{client_id}"
  message = %{type: "sdp_answer", data: answer}
  :emqtt.publish(client, topic, Jason.encode!(message))
end
```

## 调试和监控

### 开发环境调试

1. **EMQX Dashboard**：<http://localhost:18083> 监控 MQTT 连接
2. **浏览器 Console**：查看详细的分类日志
3. **Chrome DevTools**：WebRTC internals (chrome://webrtc-internals)
4. **Network Tab**：监控 WebSocket 连接状态

### 生产环境监控

- MQTT 连接状态监控
- WebRTC 连接成功率统计
- 音视频质量指标
- 错误日志聚合分析
