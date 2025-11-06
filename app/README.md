# Custom LLM HTTP Service

This service exposes the FastAPI-based SSE gateway (`custom_llm_service.py`) used to integrate the agent with VolcEngine StartVoiceChat in CustomLLM mode.

## Prerequisites

- Python ≥ 3.11 with `uv` installed.
- A valid `.env` inside `app/` providing LLM credentials (`DASHSCOPE_API_KEY`, `LLM_MODEL`, etc.).
- Optional: a bearer token (`CUSTOM_LLM_API_KEY`) if the endpoint should require authentication.

## Installation

```bash
cd app
uv sync
```

## Running

```bash
uv run --env-file .env python custom_llm_service.py \
  --host 0.0.0.0 \
  --port 8081
```

> Note: make sure to run `uv sync` after pulling new changes so the required dependencies (including `python-multipart` for photo uploads) are installed in the virtual environment.

# Photo Upload API

- `POST /api/upload` — accepts `multipart/form-data` with a `file` field and stores the image under `app/uploads/` by default.
- `GET /api/download/{file_id}` — serves the stored image back to the browser.
- Configure the storage location via `PHOTO_UPLOAD_DIR` (relative paths resolve inside the `app/` directory).

### HTTPS (optional)

The service can terminate TLS directly through uvicorn. Supply the certificate/key pair (PEM format):

```bash
uv run --env-file .env python custom_llm_service.py \
  --host 0.0.0.0 \
  --port 8081 \
  --ssl-certfile /root/code/emqx-multimedia-proxy/docker/certs/fullchain.pem \
  --ssl-keyfile /root/code/emqx-multimedia-proxy/docker/certs/privkey.pem
```

Adjust the filenames to match the certificate bundle and private key present under `/root/code/emqx-multimedia-proxy/docker/certs`. If the key is encrypted, add `--ssl-keyfile-password <password>`. Provide a CA bundle with `--ssl-ca-certs` only when mutual TLS is required.

Notes:

- `--api-key` overrides `CUSTOM_LLM_API_KEY` from `.env`. Pick a strong random token (e.g. `openssl rand -hex 16`) for production and require clients to send `Authorization: Bearer <token>`.
- Adjust `--host`/`--port` to fit your deployment (use HTTPS in production).
- Each request must include the target hardware `device_id` (either as a top-level field or inside the `custom` JSON). The first time a `device_id` is seen, the service initializes MCP and loads tools; subsequent requests with the same `device_id` reuse the existing connection to avoid repeated initialization.
- If MCP tools are temporarily unavailable, the service gracefully falls back to plain-text responses (no device control) without failing the request.
- The wait time for MCP tool discovery can be tuned via environment variable `MCP_TOOLS_WAIT_SECONDS` (default 2 seconds). After the timeout, the request immediately falls back to plain-text handling.

## Endpoint

- `POST /chat-stream`
- Compatible with the VolcEngine StartVoiceChat CustomLLM contract:
  - Request fields: `messages`, `stream`, `model`, `temperature`, `top_p`, `max_tokens`, `custom`, `round_id`, etc.
  - `device_id` is required. Embed it directly or via `custom`, e.g. `"custom":"{\"device_id\":\"web-ui-hardware-controller/xxxx\"}"`. Missing this field returns HTTP 400.
  - Response is Server-Sent Events (`text/event-stream`) streaming `chat.completion.chunk` objects and ending with `data: [DONE]`.

## Validation

The official VolcEngine validator cannot customize the request body (no way to pass `device_id`), so it will not work with this service. Use `curl` or real StartVoiceChat calls for integration testing instead:

```bash
TOKEN=$(grep '^CUSTOM_LLM_API_KEY=' .env | cut -d= -f2)
MODEL=$(grep '^LLM_MODEL=' .env | cut -d= -f2)

curl -v \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"messages\":[{\"role\":\"user\",\"content\":\"Hello\"}],\"stream\":true,\"model\":\"$MODEL\",\"device_id\":\"web-ui-hardware-controller/demo-device\"}" \
  http://127.0.0.1:8081/chat-stream
```

You should receive a `200` response with streamed `data: ...` chunks and a final `data: [DONE]`. Omitting `device_id` produces a 400 error, confirming the validation logic.

## Production Checklist

- Terminate TLS in front of the service (reverse proxy / API gateway).
- Keep tokens and LLM credentials in a secret manager instead of plain `.env`.
- Configure StartVoiceChat `LLMConfig` with `Mode=CustomLLM`, `Url` pointing to this service, and `APIKey` matching the bearer token so the platform injects the correct `Authorization` header.
- Monitor logs for `Workflow streaming failed` messages to catch upstream LLM/MCP issues.
