# Volc Real-Time Voice Pipeline

This document summarizes how the EMQ MCP AI Companion wires the browser WebRTC client, the Volc proxy server, and the Custom LLM/Agent service together.

## Components

### Web UI (`web/`)

- `useVolcRtc` (`web/src/hooks/useVolcRtc.ts`) orchestrates the Volc RTC SDK:
  - Fetches RTC credentials via `fetchScenes` (`GET /getScenes` on the proxy).
  - Joins the VERTC room using `rtcClient.joinRoom` and starts/stops local audio/video capture.
  - Calls `startVoiceChat`/`stopVoiceChat` on the proxy with `{ SceneID, LLMCustom: { device_id } }`.
  - Subscribes to `onRoomBinaryMessage` to decode subtitles/status TLVs and feeds them into UI callbacks.
- `rtcClient` (`web/src/lib/rtcClient.ts`) is a thin wrapper around `@volcengine/rtc`. It:
  - Manages the SDK engine lifecycle and AI-ANS (noise reduction) extension.
  - Publishes local media tracks and subscribes to remote tracks/data.
  - Surfaces remote streams via `getRemoteMediaStream` for playback.
- `ChatInterface` (`web/src/components/ChatInterface.tsx`) binds the streams to `<audio>`/`<video>` elements so the browser plays whatever comes from the RTC connection.
- `useMcpMqttServer` (`web/src/hooks/useMcpMqttServer.ts`) turns the browser into an MCP server (`web-ui-hardware-controller/<id>`). The device ID is sent to Volc so downstream services know which MCP tools to call.

### Volc Proxy (`volc-server/`)

- `Bun` server exposes:
  - `POST /getScenes`: returns the scene summary plus RTC token for the default scene.
  - `POST /proxy?Action=StartVoiceChat|StopVoiceChat`: relays authenticated requests to VolcEngine TOP gateway.
- `loadScenes` (`volc-server/src/scenes/loader.ts`) builds the VoiceChat payload entirely from `.env`, covering RTC, ASR, TTS, LLM, interrupt, avatar, etc.
- `handlers.ts`:
  - Regenerates the RTC token on every request.
  - Injects the browser-provided `LLMCustom` blob (which contains `device_id`) into `VoiceChat.Config.LLMConfig.Custom`.
  - Signs the request with `VOLC_ACCESS_KEY_ID/SECRET_KEY` and calls `https://rtc.volcengineapi.com`.

### Custom LLM + MCP Agent (`app/`)

- `custom_llm_service.py` exposes `POST /chat-stream` (OpenAI-style SSE) and media upload APIs.
- `ServiceState` manages a `ConversationWorkflow` per `device_id`, ensuring the MCP tools for that device are ready before handling a request.
- `ConversationWorkflow` streams the user input through `VoiceAgent` (LLM text generation) while `EmotionAgent` invokes MCP tools (camera, volume, photos, etc.). Responses are streamed back to Volc as SSE chunks (`chat.completion.chunk` + `[DONE]`).

## End-to-End Flow

1. **Scene discovery**: Browser calls `/getScenes`, receives `{ rtc: { AppId, RoomId, UserId, Token } }`.
2. **RTC join**: `useVolcRtc.connect()` hands the credentials to `rtcClient.joinRoom`, then starts local audio/video capture and publishes tracks. All RTC transport (SRTP, jitter buffers, etc.) is handled inside the Volc SDK.
3. **Start voice chat**: Browser invokes `/proxy?Action=StartVoiceChat` with `{ SceneID, LLMCustom: { device_id } }`. The proxy merges this with the `.env` config and hits VolcEngine’s StartVoiceChat API.
4. **Cloud processing**:
   - **ASR**: VolcEngine uses the provided `ASRConfig` to convert the uplink audio stream into text.
   - **LLM**: Depending on `LLMConfig.Mode`:
     - `ArkV3`: runs on Volc’s Ark endpoint.
     - `CustomLLM`: Volc posts to `app/custom_llm_service.py` `/chat-stream`, forwarding `messages`, sampling params, and `device_id`.
   - **Device control**: When `CustomLLM` runs, `ConversationWorkflow` calls MCP tools on the browser via MQTT using the same `device_id`.
   - **TTS**: VolcEngine synthesizes the assistant reply using `TTSConfig` and streams the downlink audio/video back over RTC.
5. **Receiving results**:
   - Audio/video tracks from the Volc agent user trigger `onUserPublishStream`. The web client subscribes and pipes them into `<audio>/<video>` for playback.
   - Subtitles and status updates arrive as RTC binary messages. `useVolcRtc` decodes them via `parseAigcBinaryMessage`, updating UI state and invoking `onASRResponse` / `onTTSText`.
6. **Stopping**: On disconnect, the browser stops local capture, leaves the room, and calls `/proxy?Action=StopVoiceChat` to clean up the cloud session.

## Key Files at a Glance

- `web/src/hooks/useVolcRtc.ts`: Client-side control loop (connect, publish, subscribe, start/stop voice chat).
- `web/src/lib/rtcClient.ts`: Wrapper over `@volcengine/rtc`.
- `volc-server/src/handlers.ts` & `volc-server/src/scenes/loader.ts`: Bun proxy that materializes the VoiceChat payload from environment variables and signs Volc API calls.
- `app/custom_llm_service.py`, `app/services/custom_llm_state.py`, `app/conversation_workflow.py`: SSE gateway plus MCP-aware agent workflow for CustomLLM mode.

With this flow, once StartVoiceChat succeeds, the browser only needs to maintain the RTC session; all ASR/LLM/TTS/device-control orchestration happens between VolcEngine and the Custom LLM service using the configuration supplied by the proxy.

## Text Flow Diagram

```shell
┌───────────────┐
│ 1. Web UI     │  request /getScenes
└──────┬────────┘
       │
       ▼
┌───────────────┐
│ 2. Volc Proxy │  returns RTC {AppId, RoomId, UserId, Token}
└──────┬────────┘
       │
       ▼
┌───────────────┐
│ 3. Web UI     │  rtcClient.joinRoom + startAudio/video + publish
└──────┬────────┘
       │ uplink audio/video via VERTC
       ▼
┌───────────────┐
│ 4. Volc RTC   │
│    Cloud      │  StartVoiceChat request relayed & signed by proxy
└──────┬────────┘
       │
       ▼
┌───────────────┐
│ 5. VolcEngine │  ASR + LLM (Ark or CustomLLM) + TTS
└──────┬────────┘
       │ SSE (when CustomLLM)                     MQTT tools
       │                                          (device_id)
       ▼                                          ▲
┌───────────────┐        ┌───────────────┐
│ Custom LLM    │<------>│ Browser MCP   │
│ Service       │  tools │ Server        │
└──────┬────────┘        └───────────────┘
       │
       │ tokens streamed back to VolcEngine
       ▼
┌───────────────┐
│ 6. VolcEngine │  downlink audio/video + TLV subtitles
└──────┬────────┘
       │
       ▼
┌───────────────┐
│ 7. Web UI     │  subscribe remote streams, play in ChatInterface
└──────┬────────┘
       │
       ▼
┌───────────────┐
│ 8. End User   │  hears and sees the interaction
└───────────────┘
```
