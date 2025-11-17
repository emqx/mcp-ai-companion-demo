# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

A hardware intelligent agent demonstration project based on EMQX MCP, Agent, LLM, VLM, ASR, and TTS technologies.

**Important**: Do not use Chinese comments in the code.

## Project Structure

This is a multi-component system with three main parts:

- **`app/`** - Python backend (AI Agent, MCP Client)
- **`web/`** - React frontend (MCP Server exposing hardware control tools)
- **`volc-server/`** - Bun/TypeScript proxy for VolcEngine AIGC voice APIs

## System Architecture Overview

**Key Architectural Insight**: The web UI is an **MCP Server** that exposes hardware control tools (camera, emotion, photo, volume). The Python app is an **MCP Client** that discovers and calls these tools via MQTT.

```
┌──────────────┐    WebRTC          ┌──────────────┐
│  volc-server │◄───────────────────►│   web (UI)   │
│ (Bun proxy)  │                     │  MCP Server  │
└──────────────┘                     └──────────────┘
      │                                     │
      │ HTTP SSE                           │ MQTT
      │ (CustomLLM)                        │ (MCP Protocol)
      ▼                                    ▼
┌──────────────┐                    ┌──────────────┐
│     app/     │◄───────────────────┤ MQTT Broker  │
│ (Python AI)  │   MQTT Client      │   (EMQX)     │
│  MCP Client  │   (MCP Protocol)   └──────────────┘
└──────────────┘
```

**Communication Flow:**

1. Web UI ↔ volc-server: WebRTC signaling, Start/StopVoiceChat API
2. volc-server ↔ app: HTTP SSE streaming for LLM responses
3. app ↔ Web UI: MQTT (MCP Client calls tools on MCP Server)
4. VolcEngine RTC: Real-time voice with ASR/TTS

## Development Commands

### Backend (app/)

**Requirements**: Python >= 3.11, `uv`

```bash
cd app
uv sync          # Install dependencies

# HTTP SSE server (primary mode for VolcEngine integration)
uv run --env-file .env python custom_llm_service.py --host 0.0.0.0 --port 8081

# Legacy JSON-RPC CLI mode (for media proxy pipeline)
uv run --env-file .env python main.py

# Run tests
uv run pytest
```

**Environment Setup**: Copy `app/.env.example` to `app/.env` and fill in:

- `DASHSCOPE_API_KEY` - Required for LLM
- `CUSTOM_LLM_API_KEY` - Bearer token for HTTP service authentication
- `PHOTO_UPLOAD_DIR` - Directory for photo uploads (default: uploads)

### Frontend (web/)

**Requirements**: Node.js >= 22.0.0, pnpm

```bash
cd web
pnpm install     # Install dependencies
pnpm dev         # Development server (default: http://localhost:5173)
pnpm build       # Production build
pnpm preview     # Preview production build
pnpm lint        # Run linter
```

**Environment Setup**: Copy `web/.env.example` to `web/.env` (optional):

- `VITE_AIGC_PROXY_HOST` - volc-server endpoint (default: <http://localhost:3002>)
- `VITE_MQTT_BROKER_URL` - MQTT broker WebSocket URL

### Volc Server (volc-server/)

**Requirements**: Bun

```bash
cd volc-server
TMPDIR=$PWD/.tmp bun install  # Install dependencies
bun run dev      # Development server (port 3001, hot reload)
bun run start    # Production server (port 3002)
bun run check    # Type check
bun run format   # Format code
```

**Environment Setup**: Copy `volc-server/.env.example` to `volc-server/.env` and fill in required VolcEngine credentials:

- `VOLC_ACCESS_KEY_ID` / `VOLC_SECRET_KEY` - Required
- `VOLC_RTC_APP_ID` / `VOLC_RTC_APP_KEY` - Required for WebRTC
- `VOLC_ASR_APP_ID` / `VOLC_TTS_*` - Speech service credentials
- `VOLC_LLM_URL` / `VOLC_LLM_API_KEY` - Points to app/custom_llm_service.py

### Docker Deployment

```bash
# Full stack (EMQX + app + web + volc-server)
docker compose -f docker/docker-compose.yml up -d

# Volc server + Web UI only (for local development)
docker compose up --build
# Access web UI at http://localhost:8080, proxy at http://localhost:3002

# Build individual images
docker build -t volc-server:local ./volc-server
docker build -t mcp-web:local ./web
```

See `docs/docker-build.md` for detailed Docker instructions.

## Key Architecture Patterns

### 1. Dual-Mode Backend

The Python backend supports two modes:

**HTTP SSE Mode (Primary)**:

- `app/custom_llm_service.py` - FastAPI server
- Endpoints:
  - `POST /chat-stream` - OpenAI-compatible SSE streaming
  - `POST /api/upload` - Photo upload for VLM
  - `GET /api/download/{file_id}` - Photo retrieval
- Per-device MCP connections via `ServiceState` / `McpServerRegistry`
- Integrated with VolcEngine's CustomLLM mode

**JSON-RPC CLI Mode (Legacy)**:

- `app/main.py` - Reads JSON-RPC from stdin
- Uses message queues (`asr_queue`, `tts_queue`)
- For legacy media proxy pipeline integration only

### 2. MCP Over MQTT Protocol

**Device ID is Critical**: Ties together MCP server names, MQTT topics, tool registry, and must be passed in every request.

**MQTT Topics**:

- `$mcp/presence/web-ui-hardware-controller/{device_id}` - Server presence
- `mcp/request/web-ui-hardware-controller/{device_id}/+` - Tool requests
- `mcp/response/ai_companion_demo/+` - Tool responses
- `$message/{device_id}` - Custom messages

**MCP Tools Exposed by Web UI**:

- `control_camera` - Turn camera on/off
- `change_emotion` - Set avatar emotion (happy, sad, angry, surprised, neutral)
- `take_photo` - Capture photo from camera
- `set_volume` - Adjust speaker volume

### 3. WebRTC Voice Chat Flow

1. User clicks "Connect" in Web UI
2. Web UI calls `POST /proxy?Action=StartVoiceChat` on volc-server
3. volc-server generates RTC token, forwards to VolcEngine
4. VolcEngine returns RoomID, Token, UserID
5. Web UI joins RTC room with VolcEngine SDK
6. ASR detects speech → VolcEngine calls `app/custom_llm_service.py`
7. App streams LLM response via SSE
8. VolcEngine synthesizes TTS → plays in Web UI
9. App calls MCP tools (camera/emotion) via MQTT in parallel
10. Web UI executes tools, updates UI

### 4. Photo Capture for Visual Understanding

1. Web UI captures photo from local camera
2. Uploads to `POST /api/upload` on app service
3. Returns `file_id`
4. Agent fetches via `GET /api/download/{file_id}` for VLM analysis
5. Auto-cleanup after 180 seconds (configurable via `UPLOAD_RETENTION_SECONDS`)

### 5. Configuration Split

**volc-server Configuration**:

- **Secrets** → `.env` (gitignored, credentials only)
- **Tunable parameters** → `src/config.ts` (committed, shareable)
- Includes ASR/TTS/LLM settings, semantic interrupt keywords
- Merged at runtime by `src/env.ts`

**app Configuration**:

- `.env` for API keys
- `app/prompts/*.txt` for agent personas
- `app/utils/config.py` for LLM settings

### 6. Parallel Processing

Voice responses stream immediately while tools execute in background (see `app/conversation_workflow.py::_parallel_processing`). This provides lower perceived latency.

## Important Files

### Backend (app/)

**Entry Points**:

- `custom_llm_service.py` - HTTP SSE server (primary)
- `main.py` - JSON-RPC CLI (legacy)

**Core Logic**:

- `conversation_workflow.py` - Orchestrates voice + tool execution with parallel processing
- `mcp_client_init.py` - MCP over MQTT client, server registry, tool discovery

**Agents**:

- `agents/voice_agent.py` - Conversational responses with streaming
- `agents/emotion_agent.py` - Tool-calling agent for camera/emotion

**Services**:

- `services/custom_llm_state.py` - Per-device MCP registry management
- `services/chat_stream_utils.py` - SSE streaming helpers
- `services/chat_models.py` - Pydantic models

**Configuration**:

- `utils/config.py` - LLM settings
- `prompts/voice_reply_system_prompt.txt` - Voice agent persona
- `prompts/emotion_system_prompt.txt` - Tool-calling instructions

### Frontend (web/)

**Entry Points**:

- `src/main.tsx` - App initialization
- `src/App.tsx` - Main component orchestrating all features

**MCP Server**:

- `src/lib/mcp-mqtt-server.ts` - MCP Server protocol implementation
- `src/hooks/useMcpMqttServer.ts` - React hook for MCP server lifecycle

**WebRTC**:

- `src/lib/rtcClient.ts` - VolcEngine RTC SDK wrapper
- `src/hooks/useVolcRtc.ts` - React hook for RTC operations

**API Client**:

- `src/api/aigc.ts` - volc-server API client (fetchScenes, startVoiceChat, stopVoiceChat)
- `src/types/aigc.ts` - TypeScript definitions

**Tools**:

- `src/tools/definitions.ts` - MCP tool schemas
- `src/tools/handlers.ts` - Tool execution logic

**UI Components**:

- `src/components/ChatInterface.tsx` - Main chat UI
- `src/components/EmotionAnimation.tsx` - Rive avatar animations
- `src/components/Settings.tsx` - MQTT configuration
- `src/components/ChatMessages.tsx` - Conversation display

### Volc Server (volc-server/)

**Entry Point**:

- `src/server.ts` - Bun HTTP server

**Request Handlers**:

- `src/handlers.ts` - Routes for getScenes, StartVoiceChat, StopVoiceChat

**Configuration**:

- `src/config.ts` - Scene configuration (ASR/TTS/LLM settings, NOT secrets)
- `src/env.ts` - Environment validation (credentials only)

**Supporting**:

- `src/lib/token.ts` - RTC token generation
- `src/types.ts` - TypeScript types

## Key Dependencies

### Backend (app/)

- `llama-index` - LLM orchestration
- `llama-index-llms-openai-like` - OpenAI-compatible client
- `mcp` - MCP Python SDK (EMQX fork from GitHub)
- `fastapi` + `uvicorn` - HTTP server
- `openai` - OpenAI API client

### Frontend (web/)

- `@emqx-ai/mcp-mqtt-sdk` - MCP Server over MQTT
- `@volcengine/rtc` - VolcEngine RTC SDK
- `mqtt` - MQTT.js client
- `@rive-app/react-canvas` - Avatar animations
- `shadcn/ui` - UI components

### Volc Server (volc-server/)

- `@volcengine/openapi` - VolcEngine API SDK
- `bun` - JavaScript runtime

## Testing

**Backend**: `cd app && uv run pytest`
**Frontend**: No automated tests configured (manual testing via dev server)
**Test MCP Client**: `web/src/server/mcp-client-test.mjs` (Node.js reference implementation)

## Common Development Tasks

### Adding a New MCP Tool

1. Define tool schema in `web/src/tools/definitions.ts`
2. Add handler implementation in `web/src/tools/handlers.ts`
3. Wire up callback in `web/src/App.tsx` and pass to `useMcpMqttServer`
4. Tool will be auto-discovered by app backend via MCP protocol

### Modifying Agent Behavior

**Voice Agent (conversational responses)**:

- Edit `app/prompts/voice_reply_system_prompt.txt`
- Adjust LLM settings in `app/utils/config.py`

**Emotion Agent (tool-calling)**:

- Edit `app/prompts/emotion_system_prompt.txt`
- Modify tool selection logic in `app/agents/emotion_agent.py`

### Adjusting Voice Chat Settings

Edit `volc-server/src/config.ts`:

- **ASR**: VAD thresholds, volume gain, language
- **TTS**: Voice type, speed, pitch, emotion
- **LLM**: Model, temperature, system prompt
- **Semantic Interrupts**: Keywords array (80+ predefined)

### Debugging MCP Communication

Enable debug logging:

- **Backend**: Set `DEBUG=1` in app/.env
- **Frontend**: Check browser console for MQTT messages
- **MQTT**: Use MQTT Explorer or `mosquitto_sub` to monitor topics

## Important Notes

1. **No database** - All state is in-memory or transient
2. **Photo auto-cleanup** - Uploaded photos deleted after 180 seconds
3. **Semantic interrupts** - Configured with 80+ Chinese/English keywords in volc-server/src/config.ts
4. **Device ID required** - Must be passed in every VolcEngine CustomLLM request
5. **Parallel tool execution** - Voice responses stream while tools execute in background
6. **Two backend modes** - HTTP SSE (primary) vs JSON-RPC CLI (legacy)

## Communication Protocols

1. **MQTT (MCP)** - Device control (app ↔ web)
2. **WebRTC** - Real-time audio/video (web ↔ VolcEngine)
3. **HTTP SSE** - LLM streaming (app ↔ VolcEngine)
4. **HTTP REST** - Scene config, voice chat control (web ↔ volc-server)
5. **JSON-RPC** - Legacy CLI mode (media proxy ↔ app)
