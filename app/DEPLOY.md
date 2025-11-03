# Custom LLM HTTP Service Deployment Guide

This document explains how to run the FastAPI-based SSE gateway (`custom_llm_service.py`) that exposes the agent as a VolcEngine StartVoiceChat-compatible CustomLLM endpoint.

## Prerequisites

- Python ≥ 3.11 with `uv` available.
- Valid `.env` file inside `app/`, containing the necessary LLM credentials (e.g., `DASHSCOPE_API_KEY`, `LLM_MODEL`, etc.). The service reads these through the existing configuration layer.
- Optional: a Bearer token for clients that must authenticate against the service.

## Installation

```bash
cd app
uv sync
```

## Running the Service

```bash
uv run --env-file .env python custom_llm_service.py \
  --host 0.0.0.0 \
  --port 8081
```

Notes:

- `--api-key` is optional. By default the service reads `CUSTOM_LLM_API_KEY` from `.env` (currently `4ecf5336172f1a715196f8bbd35df00d`); replace it with a strong random string (e.g., `openssl rand -hex 16`) before deploying and ensure clients send `Authorization: Bearer <your-token>`. Supplying `--api-key` on the CLI overrides the value from `.env`.
- Adjust `--host` / `--port` to match your deployment environment. For production, ensure the port is reachable over HTTPS.
- Each request now runs through the full `ConversationWorkflow` (`VoiceAgent` + `EmotionAgent`), so MCP tool calls behave exactly as in the main agent runtime. Provide `device_id` in the payload (or set `CUSTOM_LLM_DEVICE_ID`) when you need to bind the workflow to a specific MCP device.
- To preload MCP tools on startup, pass `--device-id <web-ui-hardware-controller/...>` (or set `CUSTOM_LLM_DEVICE_ID`). When provided, the service connects to MQTT immediately instead of waiting for the first request.

## Endpoint

- HTTP `POST` `/chat-stream`
- Request/response format follows VolcEngine StartVoiceChat custom model contract:
  - Accepts JSON payload with fields such as `messages`, `stream`, `model`, `temperature`, `top_p`, `max_tokens`, `custom`, `round_id`.
  - Optional field `device_id` binds the workflow to a concrete device (matching the Web UI naming `web-ui-hardware-controller/<suffix>`). You can also place `device_id` inside the `custom` JSON payload; the service extracts it before forwarding to the LLM.
  - Returns Server-Sent Events (`Content-Type: text/event-stream`) emitting `chat.completion.chunk` objects and ending with `data: [DONE]`.

## Validation

Before wiring the service into StartVoiceChat, verify it with VolcEngine’s official tool (replace arguments as needed). The commands below extract values directly from `.env`:

```bash
TOKEN=$(grep '^CUSTOM_LLM_API_KEY=' .env | cut -d= -f2)
MODEL=$(grep '^LLM_MODEL=' .env | cut -d= -f2)
```

```bash
./app-mac 'http://127.0.0.1:8081/chat-stream' \
          "$MODEL" \
          "$TOKEN" \
          '你好'
```

Successful validation produces streamed `data: {...}` events and concludes with `data: [DONE]`. If the model name or token is incorrect, the tool reports the upstream error (e.g., `model_not_found`).

Alternatively, you can spot-check with `curl`:

```bash
curl -v \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"messages\":[{\"role\":\"user\",\"content\":\"你好\"}],\"stream\":true,\"model\":\"$MODEL\"}" \
  http://127.0.0.1:8081/chat-stream
```

You should see a `200` response with `Content-Type: text/event-stream` and a sequence of `data: ...` chunks ending with `data: [DONE]`.

## Production Checklist

- Secure the service behind HTTPS (e.g., reverse proxy + TLS).
- Store `API_KEY` and LLM credentials in a secure secret manager instead of plain `.env`.
- Configure StartVoiceChat `LLMConfig` with `Mode=CustomLLM`, set `Url` to your endpoint, and pass the same token via `APIKey` so the platform adds the correct `Authorization` header.
- Monitor service logs for LLM errors (`LLM streaming failed:`) and adjust retries or fallbacks as needed.
