# Volc-Server API 参考文档

本文档提供 volc-server HTTP API 的完整参考，以及火山引擎服务集成说明。

## 概述

volc-server 是一个**辅助工具**，提供以下功能：

- **Token 生成**: 生成火山引擎 RTC 访问令牌（客户端加入 RTC 房间必需）
- **场景配置**: 返回预配置的语音场景参数（ASR/TTS/LLM 配置）
- **API 代理**: 代理调用火山引擎 AIGC API（StartVoiceChat、StopVoiceChat）

**重要说明**: volc-server **不处理**语音数据流。实际的语音交互流程：

1. 客户端 → 火山引擎 RTC（WebRTC 音频流）
2. 火山引擎 → app 服务（CustomLLM HTTP 回调）
3. app → 客户端（通过 MQTT 工具调用）

**认证方式**: 内部服务，无需认证（由容器网络或反向代理控制访问）

---

## API 端点

### 1. 获取场景列表

获取所有可用的语音场景配置，包括 RTC 连接凭证。

**端点**: `POST /getScenes`

**请求示例**:

```bash
curl -X POST http://localhost:3002/getScenes \
  -H "Content-Type: application/json"
```

**请求体**: 空 JSON `{}` 或无请求体

**响应示例**:

```json
{
  "ResponseMetadata": {
    "Action": "getScenes"
  },
  "Result": {
    "scenes": [
      {
        "scene": {
          "id": "emq-mcp-ai-companion",
          "name": "EMQ 陪伴助手",
          "icon": "https://example.com/icon.png",
          "botName": "EMQ",
          "isInterruptMode": true,
          "isVision": true,
          "isScreenMode": false,
          "isAvatarMode": false
        },
        "rtc": {
          "AppId": "671234567890123456789012",
          "RoomId": "room-a1b2c3d4-e5f6-4789-abcd-ef0123456789",
          "UserId": "user-x1y2z3w4-a5b6-4c78-def9-0123456789ab",
          "Token": "001671234567890123456789012base64encodedtoken..."
        }
      }
    ]
  }
}
```

**响应字段说明**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `scene.id` | string | 场景唯一标识符 |
| `scene.name` | string | 场景显示名称 |
| `scene.icon` | string | 场景图标 URL |
| `scene.botName` | string | Bot 显示名称 |
| `scene.isInterruptMode` | boolean | 是否启用语义打断功能 |
| `scene.isVision` | boolean | 是否支持视觉理解（VLM） |
| `scene.isScreenMode` | boolean | 是否支持屏幕共享 |
| `scene.isAvatarMode` | boolean | 是否支持虚拟形象 |
| `rtc.AppId` | string | 火山引擎 RTC 应用 ID（24 位字符） |
| `rtc.RoomId` | string | RTC 房间 ID（UUID 格式） |
| `rtc.UserId` | string | RTC 用户 ID（UUID 格式） |
| `rtc.Token` | string | RTC 访问令牌（有效期 24 小时） |

**错误响应**:

```json
{
  "ResponseMetadata": {
    "Action": "getScenes",
    "Error": {
      "Code": -1,
      "Message": "场景加载失败"
    }
  }
}
```

---

### 2. 启动语音会话

初始化一个新的语音交互会话，返回 RTC 连接参数。

**端点**: `POST /proxy?Action=StartVoiceChat`

**请求示例**:

```bash
curl -X POST "http://localhost:3002/proxy?Action=StartVoiceChat" \
  -H "Content-Type: application/json" \
  -d '{
    "SceneID": "emq-mcp-ai-companion",
    "LLMCustom": {
      "device_id": "web-ui-hardware-controller/demo-device"
    }
  }'
```

**请求参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `SceneID` | string | 否 | 场景 ID，默认 `emq-mcp-ai-companion` |
| `LLMCustom` | object | 否 | 自定义参数，传递给 CustomLLM 服务 |
| `LLMCustom.device_id` | string | 推荐 | 设备 ID，用于 MCP 工具调用 |

**LLMCustom.device_id 说明**:

- 格式: `web-ui-hardware-controller/{randomId}`
- 用途: 关联 MCP Server 名称，用于 MQTT 主题路由
- 必须与 Web UI 的 MCP Server 名称一致

**响应示例**:

```json
{
  "ResponseMetadata": {
    "Action": "StartVoiceChat",
    "RequestId": "20250104123456789abcdef01234567",
    "Region": "cn-north-1",
    "Service": "rtc"
  },
  "Result": {
    "RoomId": "room-uuid-from-volcengine",
    "UserId": "user-uuid-from-volcengine",
    "Token": "001671234567890123456789012...",
    "AppId": "671234567890123456789012"
  }
}
```

**响应字段说明**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `ResponseMetadata.RequestId` | string | 请求唯一标识 |
| `Result.RoomId` | string | RTC 房间 ID |
| `Result.UserId` | string | RTC 用户 ID |
| `Result.Token` | string | RTC 访问令牌（24 小时有效） |
| `Result.AppId` | string | RTC 应用 ID |

**客户端集成流程**:

1. 调用 `StartVoiceChat` 获取 RTC 凭证
2. 使用 `@volcengine/rtc` SDK 加入房间
3. 发布本地音频/视频流
4. 订阅远程流（TTS 语音输出）
5. 监听二进制消息（字幕、工具调用、状态更新）

**错误响应**:

```json
{
  "ResponseMetadata": {
    "Action": "StartVoiceChat",
    "Error": {
      "Code": -1,
      "Message": "场景不存在或配置错误"
    }
  }
}
```

---

### 3. 停止语音会话

终止当前语音会话，释放资源。

**端点**: `POST /proxy?Action=StopVoiceChat`

**请求示例**:

```bash
curl -X POST "http://localhost:3002/proxy?Action=StopVoiceChat" \
  -H "Content-Type: application/json" \
  -d '{
    "SceneID": "emq-mcp-ai-companion"
  }'
```

**请求参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `SceneID` | string | 否 | 场景 ID，默认 `emq-mcp-ai-companion` |

**响应示例**:

```json
{
  "ResponseMetadata": {
    "Action": "StopVoiceChat",
    "RequestId": "20250104123456789abcdef01234567"
  },
  "Result": {}
}
```

**客户端操作**:

1. 调用 `StopVoiceChat` API
2. 停止发布本地流
3. 取消订阅远程流
4. 离开 RTC 房间
5. 销毁 RTC Engine 实例

---

## 火山引擎 RTC Token

### Token 结构

volc-server 生成的 RTC Token 遵循火山引擎 RTC 规范：

```
Token = Version + AppId + Base64(Message + Signature)
```

**组成部分**:

- **Version**: `001` 固定值
- **AppId**: 24 位应用标识符
- **Message**: 二进制编码的负载
- **Signature**: HMAC-SHA256 签名

### Token 权限

自动授予的权限：

- `PrivPublishStream` - 发布流权限（包括视频、音频、数据流）
- `PrivSubscribeStream` - 订阅流权限

### Token 有效期

- **默认有效期**: 24 小时（86400 秒）
- **计算方式**: `expireAt = issuedAt + 86400`
- **建议**: Token 过期前重新调用 `getScenes` 或 `StartVoiceChat` 获取新 Token

### 实现参考

Token 生成逻辑位于 `volc-server/src/lib/token.ts`。

---

## 火山引擎 CustomLLM 集成

### CustomLLM 模式说明

本 demo 使用火山引擎的 **CustomLLM 模式**：火山引擎 RTC 服务直接回调自定义后端服务（app/custom_llm_service.py）来获取 LLM 响应。

**重要**: volc-server 仅用于生成 RTC Token 和配置场景参数，**不在**语音对话的数据流路径上。

**配置要求**:

```bash
# volc-server/.env（配置回调 URL，告诉火山引擎调用哪个地址）
VOLC_LLM_URL=http://app:8081/chat-stream  # 指向 app 服务
VOLC_LLM_API_KEY=your-secret-key           # 认证密钥

# app/.env（app 服务验证来自火山引擎的请求）
CUSTOM_LLM_API_KEY=your-secret-key  # 必须与上面一致
```

### CustomLLM 请求流程

```text
用户语音 → ASR → 火山引擎
              ↓
    HTTP POST /chat-stream (SSE)
              ↓
  app/custom_llm_service.py
              ↓
    SSE 流式响应 (OpenAI 格式)
              ↓
    火山引擎 TTS 合成
              ↓
    RTC 推送音频到客户端
```

### CustomLLM 请求格式

火山引擎发送到 CustomLLM 服务的请求：

```http
POST /chat-stream HTTP/1.1
Host: your-domain.com
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

{
  "messages": [
    {"role": "system", "content": "你是一个智能助手"},
    {"role": "user", "content": "你好"}
  ],
  "device_id": "web-ui-hardware-controller/demo-device",
  "temperature": 0.5,
  "top_p": 0.9,
  "max_tokens": 256,
  "stream": true
}
```

**关键字段**:

- `device_id`: 从 `StartVoiceChat` 的 `LLMCustom` 传递
- `stream`: 必须为 `true`（支持流式响应）

### CustomLLM 响应格式

响应必须遵循 OpenAI SSE 格式：

```text
data: {"id":"resp-1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}],"model":"qwen-flash","created":1704355200}

data: {"id":"resp-1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"你好"},"finish_reason":null}],"model":"qwen-flash","created":1704355200}

data: {"id":"resp-1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"！"},"finish_reason":"stop"}],"model":"qwen-flash","created":1704355200}

data: [DONE]
```

---

## 场景配置详解

### 配置文件结构

场景配置分为两部分：

- **环境变量** (`.env`): 敏感凭证，不提交到代码库
- **代码配置** (`src/config.ts`): 可共享参数，提交到代码库

### ASR 配置

位于 `volc-server/src/config.ts` → `asrConfig`

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `Provider` | ASR 提供商 | volcano |
| `Mode` | 识别模式（smallmodel/largemodel） | smallmodel |
| `Cluster` | 服务集群 | volcengine_streaming_common |
| `Language` | 识别语言（zh-CN/en-US） | zh-CN |
| `SilenceTime` | 静音判定时长（毫秒） | 600 |
| `VolumeGain` | 音量增益（0.0-1.0） | 0.5 |
| `SemanticContext.EnableHotword` | 启用热词识别 | true |

### TTS 配置

位于 `volc-server/src/config.ts` → `ttsConfig`

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `Provider` | TTS 提供商 | volcano |
| `VoiceType` | 音色类型 | BV033_streaming |
| `SpeedRatio` | 语速比例（0.5-2.0） | 1.2 |
| `PitchRatio` | 音调比例（0.5-2.0） | 1.1 |
| `VolumeRatio` | 音量比例（0.5-2.0） | 1.0 |
| `Emotion` | 情感类型 | happy |
| `EmotionIntensity` | 情感强度（0.0-1.0） | 0.8 |

**可用音色**:

- `BV033_streaming` - 女声，温柔
- `BV001_streaming` - 男声，磁性
- 更多音色请参考[火山引擎 TTS 文档](https://www.volcengine.com/docs/6561)

### LLM 配置

位于 `volc-server/src/config.ts` → `llmConfig`

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `Mode` | LLM 模式 | CustomLLM |
| `ModelName` | 模型名称 | qwen-flash |
| `Temperature` | 采样温度（0.0-1.0） | 0.5 |
| `TopP` | 核采样概率（0.0-1.0） | 0.9 |
| `MaxTokens` | 最大生成 token 数 | 256 |
| `HistoryLength` | 保留的历史轮数 | 15 |

### 语义打断配置

位于 `volc-server/src/config.ts` → `interrupts`

**内置关键词**（80+ 中英文）:

- 中文: '暂停', '停止', '别说了', '闭嘴', '等一下'
- 英文: 'stop talking', 'pause', 'enough', 'shut up', 'wait'

**礼貌变体**:

- 前缀: '好', '好的', 'OK'
- 后缀: '吧', '啦', '了'

自动生成 500+ 关键词变体。

---

## 错误处理

### 错误响应格式

所有错误遵循统一格式：

```json
{
  "ResponseMetadata": {
    "Action": "StartVoiceChat",
    "Error": {
      "Code": -1,
      "Message": "错误描述"
    }
  }
}
```

### HTTP 状态码

| 状态码 | 说明 | 原因 |
|--------|------|------|
| 200 | Success | 请求成功 |
| 204 | No Content | OPTIONS 预检请求 |
| 400 | Bad Request | 参数错误或缺失 |
| 404 | Not Found | 场景 ID 不存在 |
| 500 | Internal Server Error | 场景配置构建失败 |
| 502 | Bad Gateway | 火山引擎 API 调用失败 |

### 调试建议

1. **启用详细日志**:

   ```bash
   VOLC_LOG_LEVEL=debug
   ```

2. **查看请求/响应**: 日志中包含完整的 HTTP 请求和响应

3. **验证凭证**: 确认所有环境变量正确配置

---

## 客户端集成示例

### TypeScript + React

参考实现: `web/src/hooks/useVolcRtc.ts`

```typescript
import { fetchScenes, startVoiceChat } from '@/api/aigc'
import { createRTCClient } from '@/lib/rtcClient'

// 1. 获取场景配置
const scenes = await fetchScenes()
const scene = scenes[0]

// 2. 加入 RTC 房间
const rtcClient = createRTCClient()
await rtcClient.joinRoom({
  appId: scene.rtc.AppId,
  roomId: scene.rtc.RoomId,
  userId: scene.rtc.UserId,
  token: scene.rtc.Token,
})

// 3. 发布本地流
await rtcClient.startAudioCapture()
await rtcClient.publishStream('audio')

// 4. 启动语音会话
await startVoiceChat(scene.scene.id, {
  device_id: 'web-ui-hardware-controller/your-device-id'
})

// 5. 监听消息
rtcClient.on('onUserBinaryMessageReceived', (message) => {
  // 处理字幕、工具调用等
})
```

### Python

```python
import requests

# 1. 获取场景
resp = requests.post('http://localhost:3002/getScenes')
scene = resp.json()['Result']['scenes'][0]

# 2. 启动语音会话
requests.post(
    'http://localhost:3002/proxy?Action=StartVoiceChat',
    json={'SceneID': scene['scene']['id']}
)
```

---

## 性能优化

### 缓存策略

1. **Token 缓存**: Token 有效期 24 小时，客户端可缓存复用
2. **场景配置缓存**: `getScenes` 响应可缓存 1 小时

### 并发限制

- 单个 volc-server 实例建议最大支持 **100 并发会话**
- 根据实际负载调整容器资源

### 日志级别

- 生产环境使用 `info` 或 `warn`
- 开发环境使用 `debug`

---

## 相关文档

- [安装与测试指南](./installation-and-testing.md)
- [场景示例](./scenarios.md)
- [快速开始指南](../../quickstart-emq-volc.md)
- [火山引擎 RTC 文档](https://www.volcengine.com/docs/6348)
- [火山引擎 ASR/TTS 文档](https://www.volcengine.com/docs/6561)
