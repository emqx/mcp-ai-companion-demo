# Quick Start: Building an AI Agent with EMQX + VolcEngine Voice Services

This guide explains how to quickly deploy an AI agent demo system with voice interaction and device control capabilities using Docker Compose. The project uses a browser-based UI to simulate an intelligent device (with virtual camera, emotions, volume, etc.) and demonstrates how the MCP over MQTT protocol enables real-time device control by an AI Agent. The system integrates VolcEngine RTC for voice channels, ASR/TTS for speech recognition and synthesis, and CustomLLM mode to connect to a custom AI Agent service for multi-turn conversations and tool calls.

## Architecture Overview

The system consists of three core components:

### Component Overview

| Component | Role | Port | Main Functions |
|------|------|------|----------|
| **web** | MCP Server | 8080 | Frontend UI exposing hardware control tools (camera/emotions/volume) |
| **app** | MCP Client + AI Agent | 8081 | Provides `/chat-stream` endpoint, handles LLM/VLM inference and MCP tool calls |
| **volc-server** | VolcEngine Proxy | 3002 | Manages RTC rooms/tokens, configures CustomLLM address for VolcEngine callbacks to app |

### Communication Flow

```text
1. Web UI → volc-server: Request scene configuration and RTC credentials
2. Web UI ↔ VolcEngine RTC: Establish real-time audio/video connection (ASR/TTS)
3. VolcEngine → app: CustomLLM callback to /chat-stream (SSE streaming)
4. app ↔ Web UI: Call MCP tools via MQTT (camera/emotions/etc.)
5. VolcEngine → Web UI: TTS synthesized voice playback
```

**Core Capabilities**:

- **MCP over MQTT Protocol**: Cross-network tool invocation for AI Agent device control (camera, emotions, volume) via EMQX Broker
- **Multimodal Understanding**: Integrated VLM visual model supporting scenarios like "what am I holding in my hand"
- **Real-time Voice Interaction**: Based on VolcEngine RTC + ASR/TTS, end-to-end speech recognition and synthesis with low latency
- **Parallel Processing Architecture**: Asynchronous execution of tool calls and voice synthesis for smooth user experience

## Prerequisites

### 1. Docker Environment

- **Version Required**: Docker 24+
- **Verification**: Run `docker --version` to confirm

### 2. MQTT Broker

This project requires an accessible EMQX Broker for the Web service (MCP Server) and app (MCP Client + AI Agent) containers to connect.

**Deployment Options (choose one)**:

- **Self-hosted**: Refer to [EMQX Installation Documentation](https://docs.emqx.com/en/emqx/latest/deploy/install.html)
- **Managed Service**: Use [EMQX Cloud](https://docs.emqx.com/en/cloud/latest/)

**Default Configuration**:

```bash
MQTT_BROKER_HOST=localhost
MQTT_BROKER_PORT=1883
```

**For Authentication**, add:

```bash
MQTT_USERNAME=your_username
MQTT_PASSWORD=your_password
```

### 3. LLM API Key

The project defaults to using Alibaba Cloud's Bailian `qwen-flash` model.

#### Enable Alibaba Cloud Bailian

1. Visit [Alibaba Cloud Bailian Console](https://bailian.console.aliyun.com)
2. If there's an activation prompt at the top, click to enable the service (no charge for activation, only charged when API calls exceed free tier)
3. Complete real-name verification if required

#### Create API Key

1. Go to [Key Management](https://bailian.console.aliyun.com/#/api-key)
2. Under the **API-Key** tab, click **Create API-KEY**
3. Select account and workspace (usually default workspace), fill in description and confirm
4. Click the copy icon next to the API Key to obtain the key
5. Fill the obtained API Key into `DASHSCOPE_API_KEY` in `app/.env`

#### Using Other Model Services (Optional)

To use other OpenAI-compatible model services, modify these settings in `app/.env`:

```bash
LLM_API_BASE=https://your-model-service.com/v1  # Model service Base URL
LLM_API_KEY=your_api_key                        # Model service API Key
LLM_MODEL=your_model_name                       # Model name
```

**Common Model Services**:

- **OpenAI**: `https://api.openai.com/v1`
- **DeepSeek**: `https://api.deepseek.com/v1`
- **Other Compatible Services**: Refer to respective documentation

Different LLM services may have significant latency and cost differences. Choose according to your needs. For best latency, we recommend the default Alibaba Cloud Bailian `qwen-flash`.

### 4. VolcEngine Credentials

#### Enable Services

This project requires multiple VolcEngine services. Please visit [VolcEngine Console](https://console.volcengine.com/home) to register and log in.

**Required Services**:

1. **RTC Service** - [Activation Tutorial](https://www.volcengine.com/docs/6348/69865)
   - After activation, obtain `VOLC_RTC_APP_ID` and `VOLC_RTC_APP_KEY`
   - Access location: [RTC Console](https://console.volcengine.com/rtc/aigc/listRTC)

2. **ASR/TTS Voice Services** - [Doubao Voice Console](https://console.volcengine.com/speech/app)
   - When creating app, select:
     - **ASR**: Streaming Speech Recognition
     - **TTS**: Speech Synthesis
   - Obtain these credentials:
     - `VOLC_ASR_APP_ID` - Speech recognition app ID
     - `VOLC_TTS_APP_ID` - Speech synthesis app ID
     - `VOLC_TTS_APP_TOKEN` - TTS app token
     - `VOLC_TTS_RESOURCE_ID` - TTS resource ID (based on selected voice)

3. **Account Credentials** - [Key Management](https://console.volcengine.com/iam/keymanage/)
   - `VOLC_ACCESS_KEY_ID` - Access Key ID
   - `VOLC_SECRET_KEY` - Secret Access Key

#### Permission Configuration

**Must Complete**: Configure cross-service authorization in RTC console, otherwise the agent cannot properly call ASR/TTS/LLM services.

**Main Account Call** (Recommended, simpler configuration):

1. Log in to main account [RTC Console](https://console.volcengine.com/rtc)
2. Go to [Cross-Service Authorization](https://console.volcengine.com/rtc/aigc/iam)
3. Click **One-Click Enable Cross-Service Authorization** to configure `VoiceChatRoleForRTC` role
4. Use main account's AK/SK to call services

**Sub-Account Call** (Optional, requires additional configuration):

Add permissions for sub-accounts to call real-time conversational AI interfaces:

1. Log in to main account [RTC Console](https://console.volcengine.com/rtc)
2. Go to [Cross-Service Authorization](https://console.volcengine.com/rtc/aigc/iam), click **Add Permissions for Sub-Account**
3. Find the sub-account to authorize and click add permissions

> For complete RTC service activation tutorial, refer to: [Real-time Conversational AI Prerequisites](https://www.volcengine.com/docs/6348/1315561)

#### LLM Configuration

This project uses **CustomLLM mode**, where VolcEngine callbacks to the app's custom AI Agent service to get LLM responses.

**Core Requirements**:

- `VOLC_LLM_URL` - Points to app service's `/chat-stream` endpoint
  - Local deployment: `http://app:8081/chat-stream` (container network)
  - Production deployment: `https://your-domain.com/chat-stream` (must be publicly accessible)
- `VOLC_LLM_API_KEY` - Custom authentication key, must match app's `CUSTOM_LLM_API_KEY` (see below "Step 2: Configure Environment Variables")

**Model Sources** (choose one):

- **VolcEngine Ark**: Create custom inference endpoint or application in [Ark Console](https://console.volcengine.com/ark/region:ark+cn-beijing/endpoint)
- **Coze Platform**: Create agent in [Coze](https://www.coze.cn) - [Creation Tutorial](https://www.coze.cn/open/docs/guides/quickstart)
- **Third-party Models**: Prepare OpenAI-compatible service URL - [Integration Requirements](https://www.volcengine.com/docs/6348/1399966)

> **Note**: The app service in this project already implements the CustomLLM protocol. You only need to configure the API Key from "3. LLM API Key" above (e.g., `DASHSCOPE_API_KEY`), without deploying additional model services.

#### Quick Parameter Access

**Recommended Method**: Use VolcEngine official demo to quickly verify configuration

1. Visit [Real-time Conversational AI Demo](https://console.volcengine.com/rtc/aigc/run)
2. After running the demo, click the **Access API** button in the top right
3. Copy the parameter configuration code and extract the required credentials

### 5. Network Requirements

**Port Opening** (default configuration, adjustable in Compose file):

- `8080` - Web UI
- `8081` - App backend (SSE endpoint)
- `3002` - volc-server proxy (VolcEngine service configuration)

**Accessibility Requirements**:

**Important**: To fully experience the MCP over MQTT functionality of this project, the app service's `/chat-stream` endpoint **must be deployed to a publicly accessible HTTPS environment** for VolcEngine service callbacks.

- **Production Deployment** (Recommended): Deploy app to public HTTPS address (e.g., `https://your-domain.com/chat-stream`), ensure SSE responses end correctly with `data: [DONE]`
- **Local Testing**: Non-public environments can only test LLM inference and MCP over MQTT tool calls via API, cannot fully experience VolcEngine voice interaction.

## Quick Tutorial: 10-Minute Voice Interaction + Device Control Demo

After completing all prerequisites, follow these steps to quickly set up an AI agent demo with voice interaction and device control (Web simulated device).

### Step 1: Get Code

```bash
git clone -b volcengine/rtc https://github.com/emqx/mcp-ai-companion-demo.git
cd mcp-ai-companion-demo
```

### Step 2: Configure Environment Variables

This is the most critical step. We need to correctly fill in the credentials obtained from prerequisites into the configuration files for three services. Please read each configuration item's description and source carefully.

#### 2.1 Configure app Service (AI Agent Backend)

**Create Configuration File**:

```bash
cp app/.env.example app/.env
```

**Edit `app/.env` and fill in the following configuration**:

```bash
# ===== LLM Configuration =====
# Source: Prerequisite "3. LLM API Key"
# Purpose: For AI Agent to call large language model for conversational inference
DASHSCOPE_API_KEY=sk-xxxxxxxxxxxxx  # Replace with Alibaba Cloud Bailian API Key

# If using other model services, additionally configure:
# LLM_API_BASE=https://api.openai.com/v1
# LLM_MODEL=gpt-4

# ===== CustomLLM Authentication Key =====
# Source: Self-generated (recommend using strong random string)
# Purpose: VolcEngine authenticates callback request legitimacy with this key
# Requirement: Must be exactly identical to volc-server's VOLC_LLM_API_KEY
CUSTOM_LLM_API_KEY=your-strong-random-secret-key-here

# Generation example (run in terminal):
# openssl rand -base64 32
# Or use online tool: https://www.random.org/strings/

# ===== MQTT Broker Configuration =====
# Source: Prerequisite "2. MQTT Broker"
# Purpose: Connect to EMQX Broker for MCP over MQTT protocol communication
MQTT_BROKER_HOST=localhost        # EMQX Broker address
MQTT_BROKER_PORT=1883             # MQTT port

# If EMQX has authentication enabled, fill in:
MQTT_USERNAME=your_mqtt_username  # EMQX username (optional)
MQTT_PASSWORD=your_mqtt_password  # EMQX password (optional)

# ===== Optional Configuration =====
MCP_TOOLS_WAIT_SECONDS=5          # Seconds to wait for MCP tool registration
PHOTO_UPLOAD_DIR=uploads          # Photo upload directory
# APP_SSL_CERTFILE=/path/to/cert  # HTTPS certificate path (production)
# APP_SSL_KEYFILE=/path/to/key    # HTTPS key path (production)
```

**Notes**:

- **Difference between `DASHSCOPE_API_KEY` and `CUSTOM_LLM_API_KEY`**:
  - `DASHSCOPE_API_KEY`: Used for app service to **actively call** Alibaba Cloud Bailian (or other LLM service) to get AI responses
  - `CUSTOM_LLM_API_KEY`: Used for app service to **passively receive** VolcEngine callback requests for identity verification (like an API gateway access token)

- **`CUSTOM_LLM_API_KEY` Generation Methods** (choose one):

  ```bash
  # Method 1: Generate using openssl (recommended)
  openssl rand -base64 32

  # Method 2: Generate using Python
  python3 -c "import secrets; print(secrets.token_urlsafe(32))"

  # Method 3: Use online tool
  # https://www.random.org/strings/ (length 32, charset Alphanumeric)
  ```

#### 2.2 Configure volc-server Service (VolcEngine Proxy)

**Create Configuration File**:

```bash
cp volc-server/.env.example volc-server/.env
```

**Edit `volc-server/.env` and fill in VolcEngine credentials**:

```bash
# ===== VolcEngine Account Credentials =====
# Source: Prerequisite "4. VolcEngine Credentials > Enable Services > Account Credentials"
# Access location: https://console.volcengine.com/iam/keymanage/
VOLC_ACCESS_KEY_ID=AKLT*********************
VOLC_SECRET_KEY=************************************

# ===== RTC Service Credentials =====
# Source: Prerequisite "4. VolcEngine Credentials > Enable Services > RTC Service"
# Access location: https://console.volcengine.com/rtc/aigc/listRTC
VOLC_RTC_APP_ID=your_rtc_app_id
VOLC_RTC_APP_KEY=your_rtc_app_key

# ===== ASR/TTS Voice Service Credentials =====
# Source: Prerequisite "4. VolcEngine Credentials > Enable Services > ASR/TTS Voice Services"
# Access location: https://console.volcengine.com/speech/app
VOLC_ASR_APP_ID=your_asr_app_id
VOLC_TTS_APP_ID=your_tts_app_id
VOLC_TTS_APP_TOKEN=your_tts_app_token
VOLC_TTS_RESOURCE_ID=your_tts_resource_id

# ===== CustomLLM Configuration =====
# Purpose: Tell VolcEngine service which address to callback for LLM responses

# VOLC_LLM_URL - app service's /chat-stream endpoint address
# Local testing: Use Docker container network access
# VOLC_LLM_URL=http://app:8081/chat-stream
# Production: Must change to public HTTPS address (for VolcEngine callbacks)
VOLC_LLM_URL=https://your-domain.com/chat-stream

# VOLC_LLM_API_KEY - CustomLLM authentication key
# Requirement: Must be exactly identical to app/.env's CUSTOM_LLM_API_KEY
VOLC_LLM_API_KEY=your-strong-random-secret-key-here  # Keep consistent with app
```

**Configuration Checklist**:

- [ ] `VOLC_ACCESS_KEY_ID` and `VOLC_SECRET_KEY` obtained from VolcEngine console
- [ ] `VOLC_RTC_APP_ID` and `VOLC_RTC_APP_KEY` from RTC console
- [ ] `VOLC_ASR_APP_ID`, `VOLC_TTS_APP_ID`, `VOLC_TTS_APP_TOKEN`, `VOLC_TTS_RESOURCE_ID` from Doubao Voice console
- [ ] `VOLC_LLM_API_KEY` exactly matches `app/.env`'s `CUSTOM_LLM_API_KEY`
- [ ] Completed "Permission Configuration" in prerequisites (cross-service authorization)

#### 2.3 Configure web Service (Frontend UI)

The web service uses **build-time** environment variables. Default configuration is sufficient for local development:

```bash
VITE_AIGC_PROXY_HOST=http://localhost:3002  # volc-server proxy address
```

**Only customize if**:

- volc-server is deployed on a remote server
- volc-server uses a non-3002 port

**Customization Method** (export environment variable before starting):

```bash
export VITE_AIGC_PROXY_HOST=http://your-remote-host:3002
```

#### Configuration Relationship Summary

```text
Prerequisite                      Configuration File Location
├─ 3. LLM API Key           ──►  app/.env (DASHSCOPE_API_KEY)
├─ 4. VolcEngine Credentials
│  ├─ Account Credentials   ──►  volc-server/.env (VOLC_ACCESS_KEY_ID/SECRET_KEY)
│  ├─ RTC Service           ──►  volc-server/.env (VOLC_RTC_APP_ID/APP_KEY)
│  ├─ ASR/TTS Services      ──►  volc-server/.env (VOLC_ASR_*/VOLC_TTS_*)
│  └─ LLM Configuration     ──►  volc-server/.env (VOLC_LLM_URL/API_KEY)
└─ 2. MQTT Broker           ──►  app/.env (MQTT_BROKER_HOST/PORT/USERNAME/PASSWORD)

Self-generated
└─ CUSTOM_LLM_API_KEY       ──►  app/.env + volc-server/.env (must match)
```

**Key Points**:

1. **`CUSTOM_LLM_API_KEY` is the only key you need to generate yourself**, and it must be exactly identical in both `app/.env` and `volc-server/.env`
2. **`DASHSCOPE_API_KEY` is for calling LLM**, `CUSTOM_LLM_API_KEY` is for authenticating VolcEngine callbacks
3. **Production environments must change `VOLC_LLM_URL` to public HTTPS address**, otherwise VolcEngine cannot callback to app service

### Step 3: Start Services

Start all services with Docker Compose:

```bash
docker compose -f docker/docker-compose.web-volc.yml up --build
```

**Startup Process**:

1. Build images: `mcp-app`, `mcp-volc-server`, `mcp-web`
2. Start containers and listen on ports:
   - `8080` - Web UI
   - `8081` - AI Agent backend
   - `3002` - VolcEngine proxy

**First startup** may take several minutes to download dependencies and build images. Please be patient.

**View Logs** (optional):

```bash
# Real-time view of all service logs
docker compose -f docker/docker-compose.web-volc.yml logs -f

# View specific service only
docker compose -f docker/docker-compose.web-volc.yml logs -f app
```

### Step 4: Function Verification

#### 4.1 Access Web UI

Open browser and visit: [http://localhost:8080](http://localhost:8080)

You'll see a virtual device interface with conversational robot avatar, voice, camera buttons, and other elements.

#### 4.2 Configure MQTT Connection (First Use)

1. Click the **Settings** icon in the top right of the page
2. Fill in EMQX Broker configuration in the settings panel:
   - **Broker**: `ws://localhost:8083/mqtt` (use WebSocket port 8083, not MQTT port 1883)
   - **Username**: Fill in username if EMQX has authentication enabled
   - **Password**: Fill in password if EMQX has authentication enabled
3. Click the **Save** button
4. Click **Confirm** in the popup dialog, the page will automatically refresh and apply the new configuration, MQTT connection will be established automatically

> **Note**:
>
> - Device ID is automatically generated by the system (format: `web-ui-hardware-controller/{randomID}`), no manual configuration needed
> - After successful MQTT connection, MCP tools will be automatically registered and available for AI Agent calls
> - If connection fails, check if EMQX Broker's WebSocket listener is enabled (default port 8083)

#### 4.3 Start Voice Interaction

1. Find three circular buttons at the bottom center of the page (microphone, speaker, camera)
2. Click the leftmost **microphone button** (default gray)
3. Browser will request microphone permission, click **Allow**
4. System automatically initializes:
   - Microphone button shows connection animation
   - Obtain scene configuration and RTC Token through volc-server
   - Establish VolcEngine WebRTC connection
   - Initialize ASR/TTS voice services
   - Start CustomLLM callback to app's `/chat-stream` endpoint
5. After successful connection:
   - Microphone button turns purple (highlighted)
   - Page center displays "Hello, I'm EMQ Robot, turn on the microphone to start talking!"
   - Speak into the microphone to begin voice interaction

**Control Button Explanation**:

- **Microphone button** (left): Gray = not connected, Purple = connected and microphone enabled, click again to disable microphone (maintain connection)
- **Speaker button** (middle): Control TTS voice playback mute/unmute
- **Camera button** (right): Enable/disable local camera preview (for photo tool calls)

**Test Suggestions**:

**Voice Recognition and Response**:

- Say "hello" or "tell me a story" to test basic conversation
- The dialog box in the center of the page will display AI response text in real-time
- TTS voice synthesis will play simultaneously

**Device Control (MCP Tool Calls)**:

- Say "what am I holding in my hand" → Triggers camera photo and visual recognition
- Say "set volume to 80%" → Adjusts interface volume bar
- Say "change emotion to happy" → Switches avatar emotion animation
- Say "change emotion to angry" → Switches emotion again

#### 4.4 Success Verification Indicators

✅ **Voice Interaction Normal**:

- ASR correctly transcribes speech to text
- LLM streams back conversation responses
- TTS plays voice responses

✅ **MCP Tool Calls Normal**:

- Camera photo succeeds and displays in interface
- Emotions switch in real-time according to commands
- Volume adjustments take effect immediately

✅ **No Errors in Logs**:

- app logs show successful LLM and tool calls
- No MQTT connection errors in Web UI browser console
- volc-server logs show successful callbacks to app

#### 4.5 Partial Function Testing

If you only want to verify UI and VolcEngine configuration (without custom AI Agent):

```bash
docker compose -f docker/docker-compose.web-volc.yml up --build volc-server web
```

**Mode Characteristics**:

- ✅ Available: Speech recognition (ASR), speech synthesis (TTS), basic conversation
- ❌ Unavailable: MCP tool calls (camera, emotions, volume control, etc.)

**Using VolcEngine Ark Platform LLM for Conversation**:

1. Go to [Ark Console](https://console.volcengine.com/ark) to create inference endpoint or agent application
2. Obtain `EndpointId` (inference endpoint) or `BotId` (agent application)
3. Configure LLM in `volc-server/src/config.ts`:

   ```typescript
   llm: {
     mode: 'ArkV3',                    // Use Ark platform LLM
     endpointId: 'ep-xxx',             // Method 1: Inference endpoint ID (choose one)
     // botId: 'bot-xxx',               // Method 2: Agent application ID (choose one)
     systemMessages: [
       { role: 'system', content: 'You are a friendly voice assistant' }
     ],
     historyLength: 5,                 // Context history rounds
   }
   ```

4. Restart volc-server service to use VolcEngine Ark platform LLM for conversations

> **Tip**: Recommend using non-deep-thinking large models (such as Doubao-pro series) to ensure conversation fluency. For complete configuration parameters, refer to [VolcEngine Documentation](https://www.volcengine.com/docs/6348/1581714).

### Step 5: Stop Services

```bash
docker compose -f docker/docker-compose.web-volc.yml down
```

## Common Issues and Troubleshooting

### Configuration Adjustments

#### Port Conflicts

If ports are occupied, modify port mappings in `docker/docker-compose.web-volc.yml`:

```yaml
services:
  web:
    ports:
      - "8888:8080"  # Modify Web UI port
  app:
    ports:
      - "8082:8081"  # Modify app port
  volc-server:
    ports:
      - "3003:3002"  # Modify volc-server port
```

**Note**: After modifying volc-server port, update `VITE_AIGC_PROXY_HOST` environment variable accordingly.

#### Enable HTTPS (Production)

1. Prepare certificate files (`fullchain.pem`, `privkey.pem`)

   > **Important**: Must use **fullchain** (complete certificate chain), not a single certificate file. VolcEngine callbacks require verification of the complete certificate chain, otherwise SSL handshake will fail.
   >
   > - Let's Encrypt: Use `fullchain.pem` (contains certificate + intermediate certificate)
   > - Other CAs: Ensure certificate file contains complete certificate chain (server certificate + intermediate certificate)

2. Place certificate files in project directory (e.g., `certs/` folder)

3. Configure certificate paths in `app/.env`:

   ```bash
   APP_SSL_CERTFILE=./certs/fullchain.pem  # Must be fullchain
   APP_SSL_KEYFILE=./certs/privkey.pem
   ```

4. Modify `VOLC_LLM_URL` in `volc-server/.env` to HTTPS address (e.g., `https://your-domain.com:8081`)

#### Build Individual Images

To build individual service images:

```bash
docker build -t mcp-web:local ./web
docker build -t mcp-app:local ./app
docker build -t volc-server:local ./volc-server
```

### Common Issues

#### Service Startup Issues

| Issue | Possible Cause | Solution |
|------|----------|----------|
| Container fails to start | Port occupied | 1. Use `lsof -i :8080` to check process 2. Modify compose port mapping 3. Re-run `docker compose up --build` |
| Environment variables not effective | .env file loading failed | 1. Confirm `.env` is in correct directory 2. Check file permissions 3. Rebuild images |

#### VolcEngine Service Issues

| Issue | Possible Cause | Solution |
|------|----------|----------|
| Stuck on "AI Preparing" | Cross-service authorization not configured | 1. Check if "Permission Configuration" is complete 2. Confirm services are enabled with sufficient balance 3. Verify parameter case sensitivity |
| 401/403 errors | AK/SK or Token errors | 1. Check `VOLC_ACCESS_KEY_ID`/`VOLC_SECRET_KEY` 2. Confirm Token not expired 3. Verify cross-service authorization |
| Sub-account quota limit | Default quota insufficient | Go to [Quota Center](https://console.volcengine.com/quota/productList/ParameterList?ProviderCode=iam) to increase quota |

#### LLM Request Issues

| Issue | Possible Cause | Solution |
|------|----------|----------|
| LLM request failed | API Key error | 1. Confirm `DASHSCOPE_API_KEY` is correct 2. Check network connection 3. View logs: `docker compose logs app` |
| CustomLLM callback failed | Authentication key mismatch | 1. Confirm both `CUSTOM_LLM_API_KEY` match 2. Verify `VOLC_LLM_URL` address 3. Check if volc-server can access app |
| HTTPS callback failed | Incomplete certificate chain | **Must use fullchain certificate**: `APP_SSL_CERTFILE` should point to `fullchain.pem` (containing complete certificate chain), not a single `cert.pem`. VolcEngine callbacks require complete certificate chain verification, otherwise SSL handshake fails |

#### MCP Tool Call Issues

| Issue | Possible Cause | Solution |
|------|----------|----------|
| Tools unavailable | MQTT connection or device_id issue | 1. Check MQTT status in browser console 2. Confirm Device ID matches 3. Increase `MCP_TOOLS_WAIT_SECONDS=10` |
| Camera photo failed | Permission not granted | 1. Check browser camera permissions 2. Click allow access 3. Refresh page |

#### MQTT Connection Issues

| Issue | Possible Cause | Solution |
|------|----------|----------|
| MQTT connection failed | Broker configuration error | 1. Confirm EMQX Broker is running 2. Check `MQTT_BROKER_HOST`/`PORT` 3. Verify authentication info 4. Test network connectivity |
| Web UI cannot connect | WebSocket port not open | 1. Confirm WebSocket port is open (default 8083) 2. Use `ws://` protocol (e.g., `ws://localhost:8083/mqtt`) |

### Log Viewing

```bash
# View all service logs
docker compose -f docker/docker-compose.web-volc.yml logs -f

# View specific service
docker compose -f docker/docker-compose.web-volc.yml logs -f app

# View recent 100 lines
docker compose -f docker/docker-compose.web-volc.yml logs --tail=100 app
```

### Performance Optimization

- **LLM Latency**: Use low-latency models (recommend Alibaba Cloud Bailian `qwen-flash`)
- **Voice Quality**: Adjust ASR VAD thresholds and TTS voice in `volc-server/src/config.ts`
- **Tool Call Latency**: Ensure good network connectivity between app and web services, reduce MQTT communication latency (recommend deploying in same private network or low-latency environment)

**Local Development (Non-Docker)**:

web uses `pnpm dev`, app uses `uv run ...`, volc-server uses `bun run dev`
