# Hardware Intelligence Agent Demo Project

[中文](./README-zh.md)

A hardware intelligence agent demo project based on EMQX MCP, Agent, LLM, VLM, ASR, and TTS technologies. Suitable for applications such as emotional companion toys, smart appliances, smart homes, and embodied intelligence.

## Project Overview

This project implements a fully functional intelligent agent that enables users to interact naturally via voice and vision, and control various smart devices. The agent has the following core capabilities:

- **Speech Recognition & Synthesis**: Integrates speech streams for real-time speech recognition and natural speech synthesis
- **Visual Understanding**: Utilizes multimodal large models (VLM) for image-based visual content understanding
- **Intelligent Reasoning**: Combines LLM and Agent technologies to generate intelligent responses aligned with character settings
- **Device Control**: Controls peripherals such as cameras and speakers via MCP over MQTT protocol

## System Architecture

![System Architecture Diagram](docs/sys_arch.png)

## Technical Features

- **MQTT Communication**: Implements data reporting and device control based on the MQTT protocol, offering low latency, lightweight, and energy-efficient advantages
- **Intelligent Control**: Enhances intelligence by controlling hardware devices via MCP over MQTT based on LLM reasoning results
- **Multimedia Streaming**: Provides stable multimedia streaming services based on WebRTC, supporting Voice Activity Detection (VAD) and speech interruption
- **Flexible Expansion**: Highly flexible Agent implementation, supports integration with various third-party models and custom business logic
- **Private Deployment**: Supports global access with local proximity, enhancing security and effectively controlling costs

## Quick Start

1. Download the repository code

```shell
git clone https://github.com/emqx/mcp-ai-companion-demo.git
cd mcp-ai-companion-demo
```

2. Add `DASHSCOPE_API_KEY`

Please add your `DASHSCOPE_API_KEY` in `docker/.env`:

```env
DASHSCOPE_API_KEY=your_dashscope_api_key
```

3. Start the services

```shell
docker compose -f docker/docker-compose.yml up -d
```

4. Access the frontend interface

Open your browser and visit `http://localhost:4000/demo` to see the demo app's frontend interface.

### Local Preview (Volc proxy + Web UI)

Bring up the Volc real-time voice proxy together with the web interface via Docker:

1. Ensure `volc-server/.env` exists (copy from `.env.example` and fill in the required Volc credentials).
2. (Optional) export `VITE_AIGC_PROXY_HOST` to override the web build-time API endpoint. It defaults to `http://localhost:3002`, which matches the compose port mapping.
3. Build and start both services:

```bash
docker compose up --build
```

4. Open `http://localhost:8080` for the web UI. The Volc proxy is available at `http://localhost:3002`.

The compose stack exposes containers named `mcp-volc-server` and `mcp-web`, making it easy to identify the Volc proxy in `docker ps`.

Need more detail (including per-image builds or running without local Bun/Node.js)? See [docs/docker-build.md](docs/docker-build.md).

## Project Structure

### web

The frontend interface for the agent, providing user interaction and device control features. Built with React, TypeScript, Vite, Tailwind CSS, shadcn/ui, and MQTT.js, implementing MCP over MQTT protocol communication.

**Requirements**: Node.js >= 22.0.0

```bash
cd web
pnpm install
pnpm dev
```

Optional: copy `.env.example` to `.env` to override the Volc proxy host. Defaults derive from the current page origin, so most local setups work without changes.

### app

Backend agent service implemented in Python. It now exposes an HTTP SSE endpoint as the primary integration surface.

**Requirements**: Python >= 3.11, `uv`

#### Run HTTP SSE server

```bash
cd app
uv sync
uv run --env-file .env python custom_llm_service.py \
  --host 0.0.0.0 \
  --port 8081 \
```

- API: `POST /chat-stream`. Send a JSON body with OpenAI-compatible `messages`. The server responds with an SSE stream (`data: ...` chunks ending with `data: [DONE]`).

#### Legacy CLI mode

The original JSON-RPC / STDIN workflow remains available via `main.py` for legacy integrations:

```bash
cd app
uv sync
uv run --env-file .env python main.py
```

The CLI expects JSON-RPC commands from stdin, typically provided by the media proxy pipeline. Use this mode only if you integrate with the legacy streaming infrastructure; otherwise, prefer the HTTP SSE server above.

## Contact Us

If you are interested in this demo project or solution and want to learn more about commercial products and services, please [contact us](https://www.emqx.com/zh/contact).
