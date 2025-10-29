# CLAUDE.md

This is a hardware intelligent agent demonstration project based on EMQX MCP, Agent, LLM, VLM, ASR, and TTS technologies.

Do not use Chinese comments in the code.

## Project Structure

- `app/` - Core intelligent agent code, containing multimedia service interactions and implementation of LLM and VLM interactions
- `web/` - Frontend interface, providing user interaction and device control functionality
- `volc-server/` - VolcEngine AIGC real-time voice API proxy server (Bun + TypeScript)

## Tech Stack

### Backend (app/)

- **Python** >= 3.11
- **uv** - Package manager
- **FastAPI** - Web framework
- **LlamaIndex** - LLM integration framework
- **OpenAI/SiliconFlow** - LLM services
- **MCP (Model Context Protocol)** - Device control through MQTT protocol
- **MQTT** - Message transport protocol

### Frontend (web/)

- **Node.js** >= 22.0.0
- **React + TypeScript**
- **Vite** - Build tool
- **Tailwind CSS** + **shadcn/ui** - UI framework
- **MQTT.js** - MQTT client

## Key Features

1. **Speech Recognition and Synthesis** - Integrate voice streaming for real-time speech recognition and natural voice synthesis
2. **Visual Understanding** - Utilize multimodal large models (VLM) for image-based visual content understanding
3. **Intelligent Reasoning** - Combine LLM and Agent technologies to generate intelligent responses that match character settings
4. **Device Control** - Control cameras, speakers, and other peripherals through MCP over MQTT protocol

## Development Commands

### Backend

```bash
cd app
uv sync          # Install dependencies
uv run main.py   # Run main program
```

### Frontend

```bash
cd web
pnpm install     # Install dependencies
pnpm dev         # Development server
```

### Volc Server

```bash
cd volc-server
cp .env.example .env  # Configure environment variables
TMPDIR=$PWD/.tmp bun install  # Install dependencies
bun run dev      # Development server (default port 3001)
```

## Environment Variables

- `MQTT_CLIENT_ID` - MQTT client ID
- `MQTT_BROKER_HOST` - MQTT broker address (default: localhost)
- `MQTT_BROKER_PORT` - MQTT broker port (default: 1883)

## Architecture Description

The system adopts an event-driven architecture:

- Main program communicates with external services through JSON-RPC protocol
- ASR service recognizes voice input and puts it into asr_queue
- Agent processes user input and generates responses
- TTS service synthesizes voice output, handled through tts_queue
- MCP client controls hardware devices through MQTT protocol

## Key Files

- `app/main.py` - Main program entry point, handling message queues and event loops
- `app/agents.py` - MCP client initialization and Agent integration
- `app/mcp_client_init.py` - MCP MQTT client initialization
