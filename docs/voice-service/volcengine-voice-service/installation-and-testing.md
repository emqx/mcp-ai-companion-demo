# 火山云语音服务使用指南

## 概述

本指南介绍如何在你的应用中集成火山云语音服务，实现语音交互功能。

### 服务架构

```text
用户应用（Web/硬件）
    ↓ WebRTC（音频流）
火山引擎 RTC 服务（ASR/TTS）
    ↓ HTTP SSE（CustomLLM 回调）
app（AI Agent 后端）
    ↓ MQTT（MCP 工具调用）
MQTT Broker（EMQX）
    ↓
用户应用（接收控制指令）

注：volc-server 仅用于生成 RTC Token，不在主通信路径上
```

### 核心能力

- **语音识别（ASR）**: 实时识别用户语音输入
- **语音合成（TTS）**: 将 AI 回复转换为语音输出
- **智能对话（LLM）**: 理解用户意图并生成回复
- **工具调用**: 通过语音控制设备（相机、表情、音量等）
- **视觉理解（VLM）**: 识别和理解图像内容

### 适用场景

- **Web 应用**: 浏览器端语音交互（本指南重点）
- **硬件设备**: IoT 设备语音控制（需要 RTC 客户端）
- **移动应用**: iOS/Android 语音助手

---

## 快速开始

### Web 应用集成（3 步）

如果你想在 Web 应用中集成语音服务：

#### 步骤 1: 部署服务端

使用 Docker Compose 一键部署所有服务：

```bash
git clone https://github.com/emqx/mcp-ai-companion-demo.git
cd mcp-ai-companion-demo

# 配置环境变量（详见下文"部署服务端"章节）
cp volc-server/.env.example volc-server/.env
cp app/.env.example app/.env

# 启动服务
docker compose -f docker/docker-compose.web-volc.yml up -d
```

服务启动后：

- **volc-server** (`http://localhost:3002`): 提供 RTC Token 生成和场景配置
- **app backend** (`http://localhost:8081`): 接收火山引擎 CustomLLM 回调，处理对话和工具调用
- **MQTT Broker** (`ws://localhost:8083/mqtt`): 用于 app 和 Web UI 之间的工具调用通信

#### 步骤 2: 在前端集成 RTC SDK

安装依赖：

```bash
npm install @volcengine/rtc mqtt
```

调用语音服务 API：

```typescript
// 1. 获取 RTC 连接凭证
const response = await fetch('http://localhost:3002/getScenes', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
})
const { Result } = await response.json()
const scene = Result.scenes[0]

// 2. 创建 RTC 客户端（使用火山引擎 SDK）
import VERTC from '@volcengine/rtc'
const rtcClient = VERTC.createClient({
  appId: scene.rtc.AppId,
  roomId: scene.rtc.RoomId,
  userId: scene.rtc.UserId,
  token: scene.rtc.Token,
})

// 3. 加入房间并发布音频流
await rtcClient.joinRoom()
await rtcClient.publishStream(MediaStreamTrack.getUserMedia({ audio: true }))

// 4. 监听 TTS 语音输出
rtcClient.on('user-published', (remoteUser) => {
  rtcClient.subscribe(remoteUser.userId, 'audio')
})
```

#### 步骤 3: 测试语音交互

1. 打开你的 Web 应用，允许麦克风权限
2. 对着麦克风说话，例如"你好"
3. 听到 AI 的语音回复

**完整示例代码**: 参考 `web/src/hooks/useVolcRtc.ts`

---

### 硬件设备集成

硬件设备需要：

1. **支持 WebRTC 的客户端库**（如 C++ libwebrtc、Python aiortc）
2. **MQTT 客户端**（用于接收工具调用指令）

**集成流程**:

```text
硬件设备
  ↓ (1) 调用 HTTP API 获取 RTC Token
volc-server: POST /proxy?Action=StartVoiceChat
  ↓ (2) 返回 RoomId, UserId, Token
硬件设备
  ↓ (3) 使用 WebRTC SDK 加入房间
  ↓ (4) 发布麦克风音频流
  ↓ (5) 订阅 TTS 语音流（播放）
  ↓ (6) 通过 MQTT 接收控制指令
```

**参考资源**:

- [火山引擎 RTC SDK](https://www.volcengine.com/docs/6348)（支持 iOS/Android/C++/Python）
- MQTT 客户端库：[paho-mqtt](https://github.com/eclipse/paho.mqtt.python)

---

## 部署服务端

### 前置要求

### 1. Docker 环境

- **版本要求**: Docker 24+
- **验证方式**: 运行 `docker --version` 确认

### 2. 火山引擎凭证

#### 2.1 开通服务

访问[火山引擎控制台](https://console.volcengine.com/home)注册并登录。

**必需服务**:

1. **RTC 服务** - [开通教程](https://www.volcengine.com/docs/6348/69865)
   - 开通后获取 `VOLC_RTC_APP_ID` 和 `VOLC_RTC_APP_KEY`
   - 访问位置: [RTC 控制台](https://console.volcengine.com/rtc/aigc/listRTC)

2. **ASR/TTS 语音服务** - [豆包语音控制台](https://console.volcengine.com/speech/app)
   - 创建应用时选择:
     - **ASR**: 流式语音识别
     - **TTS**: 语音合成
   - 获取以下凭证:
     - `VOLC_ASR_APP_ID` - 语音识别应用 ID
     - `VOLC_TTS_APP_ID` - 语音合成应用 ID
     - `VOLC_TTS_APP_TOKEN` - TTS 应用 Token
     - `VOLC_TTS_RESOURCE_ID` - TTS 资源 ID（根据选择的音色）

3. **账号凭证** - [密钥管理](https://console.volcengine.com/iam/keymanage/)
   - `VOLC_ACCESS_KEY_ID` - 访问密钥 ID
   - `VOLC_SECRET_KEY` - 访问密钥 Secret

#### 2.2 权限配置

**必须完成**: 在 RTC 控制台配置跨服务授权，否则 Agent 无法正常调用 ASR/TTS/LLM 服务。

**主账号调用**（推荐，配置更简单）:

1. 登录主账号 [RTC 控制台](https://console.volcengine.com/rtc)
2. 前往[跨服务授权](https://console.volcengine.com/rtc/aigc/iam)
3. 点击 **一键开启跨服务授权**，配置 `VoiceChatRoleForRTC` 角色
4. 使用主账号的 AK/SK 调用服务

**子账号调用**（可选，需额外配置）:

1. 登录主账号 [RTC 控制台](https://console.volcengine.com/rtc)
2. 前往[跨服务授权](https://console.volcengine.com/rtc/aigc/iam)，点击**为子账号添加权限**
3. 找到需要授权的子账号，点击添加权限

> 完整的 RTC 服务开通教程请参考: [实时语音通话 AI 接入前提](https://www.volcengine.com/docs/6348/1315561)

#### 2.3 快速获取参数

**推荐方法**: 使用火山引擎官方 Demo 快速验证配置

1. 访问[实时语音通话 AI Demo](https://console.volcengine.com/rtc/aigc/run)
2. 运行 Demo 后，点击右上角**接入 API** 按钮
3. 复制参数配置代码，提取所需凭证

### 3. CustomLLM 服务

火山引擎 RTC 服务需要回调 CustomLLM 服务（`app/custom_llm_service.py`）来处理对话。

**核心要求**:

- app 服务必须部署并可被火山引擎访问
  - 本地测试: `http://localhost:8081/chat-stream`（需通过 volc-server 的 `VOLC_LLM_URL` 配置转发）
  - 生产部署: `https://your-domain.com/chat-stream`（必须公网可访问）
- `CUSTOM_LLM_API_KEY` - app 服务的认证密钥，需与 volc-server 的 `VOLC_LLM_API_KEY` 一致

**工作流程**:

1. 用户语音 → 火山引擎 RTC（ASR 识别）
2. 火山引擎 → HTTP 回调 app 服务的 `/chat-stream`
3. app → 返回 LLM 响应（SSE 流式）
4. 火山引擎 → TTS 合成并推送语音到用户

---

## 详细部署步骤

本节详细说明如何配置和部署服务端组件。

### 使用 Docker Compose（推荐）

#### 1. 获取项目代码

```bash
git clone https://github.com/emqx/mcp-ai-companion-demo.git
cd mcp-ai-companion-demo
```

#### 2. 配置 volc-server 环境变量

创建 `volc-server/.env` 文件:

```bash
cp volc-server/.env.example volc-server/.env
```

编辑 `volc-server/.env`:

```bash
# ===== 火山引擎 API 凭证（必需）=====
VOLC_ACCESS_KEY_ID=AKLTxxxxx          # 火山引擎 Access Key ID
VOLC_SECRET_KEY=xxxxxxxxxxxxx         # 火山引擎 Secret Key

# ===== RTC 应用凭证（必需）=====
VOLC_RTC_APP_ID=671234567890123456789012  # RTC 应用 ID（24 位）
VOLC_RTC_APP_KEY=xxxxxxxxxxxxxx            # RTC 应用密钥

# ===== ASR/TTS 配置（可选）=====
VOLC_ASR_APP_ID=your_asr_app_id       # ASR 应用 ID
VOLC_TTS_APP_ID=your_tts_app_id       # TTS 应用 ID
VOLC_TTS_APP_TOKEN=your_tts_token     # TTS Token
VOLC_TTS_RESOURCE_ID=your_resource_id # TTS 资源 ID

# ===== CustomLLM 配置（必需）=====
VOLC_LLM_URL=http://app:8081/chat-stream  # app 服务地址
VOLC_LLM_API_KEY=your-strong-secret-key    # 与 app/.env 的 CUSTOM_LLM_API_KEY 保持一致

# ===== 可选配置 =====
PORT=3002                             # 服务端口（默认 3002）
VOLC_LOG_LEVEL=info                   # 日志级别: debug/info/warn/error
```

#### 3. 配置其他服务

确保同时配置好 `app/.env` 和 `web/.env`，详细步骤参考[快速开始指南](../../quickstart-emq-volc.md#step-2-configure-environment-variables)。

#### 4. 启动所有服务

```bash
docker compose -f docker/docker-compose.web-volc.yml up --build
```

**服务访问地址**:

- **volc-server**: <http://localhost:3002> - RTC Token 生成服务
- **app backend**: <http://localhost:8081> - CustomLLM 回调服务（接收火山引擎请求）
- **Web UI**: <http://localhost:8080> - 演示界面（可选）
- **MQTT Broker**: `ws://localhost:8083/mqtt` - MCP 工具调用通信

#### 5. 停止服务

```bash
docker compose -f docker/docker-compose.web-volc.yml down
```

---

### 本地开发部署（可选）

如果你需要修改 volc-server 代码进行开发，可以使用本地部署方式。

#### 开发环境要求

- **Bun >= 1.0** - [安装指南](https://bun.sh/docs/installation)

#### 安装依赖

```bash
cd volc-server
TMPDIR=$PWD/.tmp bun install
```

#### 配置环境

按照上文"方式一"中的说明配置 `volc-server/.env`。

#### 本地启动

**开发模式**（支持热重载）:

```bash
bun run dev  # 端口 3001
```

**生产模式**:

```bash
bun run start  # 端口 3002
```

---

## 测试验证

### 测试 1: 验证服务启动

检查 volc-server 是否成功启动:

```bash
curl -X POST http://localhost:3002/getScenes \
  -H "Content-Type: application/json"
```

**预期响应**:

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
          "isInterruptMode": true,
          "isVision": true
        },
        "rtc": {
          "AppId": "671234567890123456789012",
          "RoomId": "room-uuid",
          "UserId": "user-uuid",
          "Token": "001..."
        }
      }
    ]
  }
}
```

**验证要点**:

- ✅ HTTP 状态码为 200
- ✅ `scene.id` 为 `emq-mcp-ai-companion`
- ✅ `rtc.Token` 以 `001` 开头（版本号）
- ✅ `rtc.AppId` 长度为 24 位

---

### 测试 2: 启动语音会话

验证 volc-server 能否成功调用火山引擎 API:

```bash
curl -X POST "http://localhost:3002/proxy?Action=StartVoiceChat" \
  -H "Content-Type: application/json" \
  -d '{
    "SceneID": "emq-mcp-ai-companion",
    "LLMCustom": {
      "device_id": "web-ui-hardware-controller/test-device"
    }
  }'
```

**预期响应**:

```json
{
  "ResponseMetadata": {
    "Action": "StartVoiceChat",
    "RequestId": "20250104123456789abcdef"
  },
  "Result": {
    "RoomId": "room-uuid",
    "UserId": "user-uuid",
    "Token": "001...",
    "AppId": "671234567890123456789012"
  }
}
```

**验证要点**:

- ✅ HTTP 状态码为 200
- ✅ `ResponseMetadata.Action` 为 `StartVoiceChat`
- ✅ `Result.Token` 已生成

---

### 测试 3: 端到端语音交互测试

使用 Web UI 进行完整的语音交互测试。

#### 前置条件

确保所有服务已启动:

```bash
docker compose -f docker/docker-compose.web-volc.yml ps
```

应显示三个服务都在运行（web, app, volc-server）。

#### 测试步骤

1. **打开 Web UI**: 访问 <http://localhost:8080>

2. **配置 MQTT**:
   - 点击右上角设置图标
   - 填写 MQTT Broker URL（如 `ws://localhost:8083/mqtt`）
   - 点击"保存"

3. **建立 RTC 连接**:
   - 点击"连接"按钮
   - 授权麦克风权限
   - 等待状态变为"已连接"

4. **测试语音交互**:
   - 对着麦克风说话（如"你好"）
   - 观察 ASR 识别结果显示在界面
   - 听到 TTS 合成的回复语音

5. **测试工具调用**:
   - 说"帮我打开相机"，观察摄像头预览出现
   - 说"帮我拍张照片"，验证照片捕获功能
   - 观察 Avatar 表情根据对话自动变化

#### 功能验证清单

- [ ] RTC 连接成功
- [ ] 麦克风音频采集正常
- [ ] ASR 识别用户语音
- [ ] LLM 生成回复
- [ ] TTS 语音播放
- [ ] 相机控制工具调用成功
- [ ] 拍照功能正常
- [ ] 表情控制自动切换
- [ ] 音量控制生效

---

## 故障排查

### 常见问题及解决方案

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| `getScenes` 返回空场景数组 | 环境变量未正确配置 | 检查 `volc-server/.env` 文件是否存在，确认所有必需凭证已填写 |
| `StartVoiceChat` 返回 502 Bad Gateway | 火山引擎 API 调用失败 | 验证 AccessKey/SecretKey 是否有效，检查账号是否开通 RTC 服务 |
| RTC Token 无效（客户端加入房间失败） | Token 生成逻辑错误或凭证不匹配 | 确认 `VOLC_RTC_APP_ID` 和 `VOLC_RTC_APP_KEY` 正确，且 AppKey 与 AppId 匹配 |
| 日志显示 "Missing required environment variable" | 必需的环境变量未设置 | 查看错误日志中提示的变量名，在 `.env` 中补充配置 |
| CustomLLM 连接失败 | app 服务未启动或地址配置错误 | 确认 app 服务正常运行，检查 `VOLC_LLM_URL` 是否正确 |
| ASR 无法识别语音 | ASR 配置错误或服务未开通 | 检查火山引擎控制台是否开通 ASR 服务，验证 `VOLC_ASR_APP_ID` 是否正确 |
| TTS 无声音 | TTS 凭证缺失或无效 | 确认 `VOLC_TTS_APP_ID`, `VOLC_TTS_APP_TOKEN`, `VOLC_TTS_RESOURCE_ID` 已配置 |
| Docker 容器无法启动 | 端口被占用或资源不足 | 检查端口 8080/8081/3002 是否被占用，确认 Docker 资源配置充足 |

### 调试技巧

#### 1. 启用详细日志

在 `volc-server/.env` 中设置:

```bash
VOLC_LOG_LEVEL=debug
```

重启服务后可查看完整的请求/响应日志。

#### 2. 查看容器日志

```bash
# 查看所有服务日志
docker compose -f docker/docker-compose.web-volc.yml logs -f

# 查看特定服务日志
docker compose -f docker/docker-compose.web-volc.yml logs -f volc-server
```

#### 3. 验证火山引擎 API 连通性

```bash
curl -I https://rtc.volcengineapi.com
```

应返回 HTTP 200 或 404（说明域名可达）。

#### 4. 测试 CustomLLM 端点

```bash
curl -X POST http://localhost:8081/chat-stream \
  -H "Authorization: Bearer your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "hello"}],
    "device_id": "test",
    "stream": true
  }'
```

应返回 SSE 流式响应。

---

## 配置优化建议

### 生产环境部署

1. **启用 HTTPS**:
   - 配置反向代理（Nginx/Caddy）
   - 申请 SSL 证书
   - 确保 `VOLC_LLM_URL` 使用 HTTPS

2. **调整日志级别**:
   - 生产环境使用 `info` 或 `warn`
   - 避免 `debug` 级别影响性能

3. **资源限制**:
   - 单个 volc-server 实例建议最大支持 100 并发会话
   - 根据实际负载调整容器资源配额

### 性能优化

1. **Token 缓存**: Token 有效期 24 小时，可在客户端缓存复用
2. **场景配置缓存**: `getScenes` 响应可缓存 1 小时
3. **并发控制**: 根据服务器性能合理控制并发连接数

---

## 下一步

- 📖 阅读 [API 文档](./api.md) 了解详细的接口说明
- 🎯 查看 [场景示例](./scenarios.md) 学习典型应用场景
- 🚀 参考 [快速开始指南](../../quickstart-emq-volc.md) 了解完整系统部署
- 🐳 查看 [Docker 构建文档](../../docker-build.md) 了解容器化部署细节

---

## 相关资源

- [火山引擎 RTC 文档](https://www.volcengine.com/docs/6348)
- [火山引擎 ASR 文档](https://www.volcengine.com/docs/6561)
- [火山引擎 TTS 文档](https://www.volcengine.com/docs/6561)
- [Bun 官方文档](https://bun.sh/docs)
- [EMQX 文档](https://docs.emqx.com)
