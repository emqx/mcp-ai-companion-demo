# Volc Voice Agent Proxy

Bun + TypeScript server that proxies VolcEngine AIGC real-time voice APIs.

- Exposes `/getScenes` and `/proxy` endpoints matching the Web client contract
- Loads configuration entirely from environment variables, no JSON config files needed
- Autogenerates Room/User IDs and 24h RTC tokens
- Signs VolcEngine TOP gateway requests and forwards `StartVoiceChat` / `StopVoiceChat`

## 1. Prepare Environment

```bash
cd volc-server
cp .env.example .env
# Fill in all required configuration values:
# VOLC_ACCESS_KEY_ID / VOLC_SECRET_KEY (required)
# VOLC_RTC_APP_ID / VOLC_RTC_APP_KEY (required)
# VOLC_ASR_APP_ID / VOLC_TTS_APP_ID (for speech services)
# VOLC_LLM_ENDPOINT_ID (for LLM services)
# Other optional configurations for voice, LLM, agent, and avatar settings
```

The server now loads all configuration from environment variables only. No JSON config files are needed, making it more secure and easier to manage across different environments.

## 2. Install Dependencies

```bash
TMPDIR=$PWD/.tmp bun install
```

> Some sandboxes require an explicit `TMPDIR`; otherwise Bun may not write temp files.

## 3. Run

```bash
bun run dev   # hot reload, default port 3001
# or
bun run start
```

## 4. Format

```bash
bun run format
```

Verify with curl:

```bash
curl -X POST http://localhost:3001/getScenes
curl -X POST 'http://localhost:3001/proxy?Action=StartVoiceChat' \
  -H 'Content-Type: application/json' \
  -d '{"SceneID":"emq-mcp-ai-companion"}'
```

## 5. Structure

```shell
volc-server/
├── src/
│   ├── server.ts          # Bun HTTP server entry
│   ├── env.ts             # Runtime environment validation with type conversion
│   ├── types.ts           # Scene / API typings
│   ├── handlers.ts        # HTTP request handlers
│   ├── lib/
│   │   └── token.ts       # RTC token generator
│   └── scenes/
│       └── loader.ts      # Scene builder from environment variables
├── .env.example           # Complete environment variable template
├── .env                   # Your actual configuration (not in version control)
├── package.json
├── bunfig.toml
└── tsconfig.json
```

## 6. Configuration

The server uses environment variables exclusively for configuration. Key categories:

- **Credentials**: `VOLC_ACCESS_KEY_ID`, `VOLC_SECRET_KEY`
- **RTC**: `VOLC_RTC_APP_ID`, `VOLC_RTC_APP_KEY`
- **Speech**: `VOLC_ASR_APP_ID`, `VOLC_TTS_APP_ID`, `VOLC_TTS_VOICE_TYPE`
- **LLM**: `VOLC_LLM_ENDPOINT_ID`, `VOLC_LLM_SYSTEM_MESSAGE`
- **Agent**: `VOLC_AGENT_USER_ID`, `VOLC_AGENT_WELCOME_MESSAGE`, `VOLC_AGENT_ANS_MODE` (default 2 = medium), `VOLC_AGENT_VOICEPRINT_MODE` (default 1 = realtime)
- **Scene**: `VOLC_SCENE_NAME`, `VOLC_SCENE_ICON`
- **Avatar**: `VOLC_AVATAR_ENABLED`, `VOLC_AVATAR_TYPE`

See `.env.example` for all available options and their defaults.

VolcEngine docs for reference:

- <https://www.volcengine.com/docs/6348/1310560>
- <https://www.volcengine.com/docs/6348/106914>
