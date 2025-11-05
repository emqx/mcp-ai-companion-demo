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
  -d '{"SceneID":"emq-mcp-ai-companion","LLMCustom":{"device_id":"web-ui-hardware-controller/demo-device"}}'

👉 `LLMCustom.device_id` is forwarded as-is to the custom LLM interface. The backend uses it to initialize and then reuse the corresponding MCP session. In production, replace this with the actual ID used by the Web/MQTT client.
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
- **Speech**: `VOLC_ASR_APP_ID`, `VOLC_TTS_APP_ID`, `VOLC_TTS_PROVIDER`, `VOLC_TTS_MODE`, `VOLC_TTS_VOICE_TYPE`
- **Interrupts**: `VOLC_INTERRUPT_MODE`, `VOLC_INTERRUPT_SPEECH_DURATION`, `VOLC_INTERRUPT_SILENCE_TIME`, `VOLC_INTERRUPT_VOLUME_GAIN`, `VOLC_INTERRUPT_KEYWORDS`
- **LLM**: `VOLC_LLM_ENDPOINT_ID`, `VOLC_LLM_SYSTEM_MESSAGE`
- **Agent**: `VOLC_AGENT_USER_ID`, `VOLC_AGENT_WELCOME_MESSAGE`, `VOLC_AGENT_ANS_MODE` (default 2 = medium), `VOLC_AGENT_VOICEPRINT_MODE` (default 1 = realtime)
- **Scene**: `VOLC_SCENE_NAME`, `VOLC_SCENE_ICON`
- **Avatar**: `VOLC_AVATAR_ENABLED`, `VOLC_AVATAR_TYPE`

See `.env.example` for all available options and their defaults.

`VOLC_INTERRUPT_KEYWORDS` accepts either a comma-separated list or a JSON array string. The defaults cover common Chinese and English interrupt keywords, e.g. "谢谢", "停", "Stop".

### CustomLLM integration

Set `VOLC_LLM_MODE=CustomLLM` when you want VolcEngine to call a third-party agent instead of an Ark endpoint. The proxy fills the `StartVoiceChat` payload directly from environment variables:

- `VOLC_LLM_URL` (required): HTTPS endpoint of your agent (must support SSE and return `data: [DONE]`).
- `VOLC_LLM_API_KEY` (optional): forwarded as `Authorization: Bearer <token>`.
- `VOLC_LLM_MODEL_NAME`: copied to the `model` field of each request.
- `VOLC_LLM_TEMPERATURE`, `VOLC_LLM_TOP_P`, `VOLC_LLM_MAX_TOKENS`: numeric sampling parameters.
- `VOLC_LLM_HISTORY_LENGTH`: controls how many turns VolcEngine sends in `messages`.
- `VOLC_LLM_EXTRA_HEADERS`, `VOLC_LLM_STREAM_OPTIONS`, `VOLC_LLM_USER_PROMPTS`: JSON strings for advanced options documented by VolcEngine.

Example snippet for a locally hosted agent:

```env
VOLC_LLM_MODE=CustomLLM
VOLC_LLM_URL=https://demo.emqx.com:8081/chat-stream
VOLC_LLM_API_KEY=4ecf5336172f1a715196f8bbd35df00d
VOLC_LLM_MODEL_NAME=qwen-flash
VOLC_LLM_TEMPERATURE=0.7
VOLC_LLM_TOP_P=0.9
VOLC_LLM_MAX_TOKENS=512
VOLC_LLM_HISTORY_LENGTH=5
VOLC_LLM_ENABLE_ROUND_ID=true
VOLC_LLM_STREAM_OPTIONS={"include_usage":true}
```

### Selecting a natural TTS profile

- `VOLC_TTS_MODE`:
  - `standard` (default) uses the traditional Volc streaming TTS, which maps to `speed_ratio/pitch_ratio/volume_ratio`.
  - `bigtts` uses a large TTS synthesis model (more natural and expressive), automatically mapped to `speech_ratio/pitch_rate`.
  - `bidirection` connects to a streaming large model and requires `VOLC_TTS_APP_TOKEN` and `VOLC_TTS_RESOURCE_ID`. Additional features can be toggled via `VOLC_TTS_DISABLE_MARKDOWN_FILTER` and `VOLC_TTS_ENABLE_LATEX_TN`.
- `VOLC_TTS_IGNORE_BRACKET_TEXT` accepts a JSON array or a comma-separated list; e.g., `[1,2]` filters text inside brackets.
- Optional emotion parameters: set `VOLC_TTS_EMOTION` and `VOLC_TTS_EMOTION_INTENSITY` (range 0–1) to add emotional coloring to the large-model voice.

VolcEngine docs for reference:

- <https://www.volcengine.com/docs/6348/1310560>
- <https://www.volcengine.com/docs/6348/106914>
