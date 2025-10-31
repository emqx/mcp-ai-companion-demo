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
- **Speech**: `VOLC_ASR_APP_ID`, `VOLC_TTS_APP_ID`, `VOLC_TTS_PROVIDER`, `VOLC_TTS_MODE`, `VOLC_TTS_VOICE_TYPE`
- **Interrupts**: `VOLC_INTERRUPT_MODE`, `VOLC_INTERRUPT_SPEECH_DURATION`, `VOLC_INTERRUPT_SILENCE_TIME`, `VOLC_INTERRUPT_VOLUME_GAIN`, `VOLC_INTERRUPT_KEYWORDS`
- **LLM**: `VOLC_LLM_ENDPOINT_ID`, `VOLC_LLM_SYSTEM_MESSAGE`
- **Agent**: `VOLC_AGENT_USER_ID`, `VOLC_AGENT_WELCOME_MESSAGE`, `VOLC_AGENT_ANS_MODE` (default 2 = medium), `VOLC_AGENT_VOICEPRINT_MODE` (default 1 = realtime)
- **Scene**: `VOLC_SCENE_NAME`, `VOLC_SCENE_ICON`
- **Avatar**: `VOLC_AVATAR_ENABLED`, `VOLC_AVATAR_TYPE`

See `.env.example` for all available options and their defaults.

`VOLC_INTERRUPT_KEYWORDS` accepts either a comma-separated list or a JSON array string. The defaults覆盖常用的中英文打断词，例如“谢谢”“停”“Stop”。

### Selecting a natural TTS profile

- `VOLC_TTS_MODE`:
  - `standard` (默认) 使用传统火山流式 TTS，对应 `speed_ratio/pitch_ratio/volume_ratio`。
  - `bigtts` 使用语音合成大模型（更自然、更具情感），自动映射为 `speech_ratio/pitch_rate`。
  - `bidirection` 对接流式大模型，需要提供 `VOLC_TTS_APP_TOKEN` 与 `VOLC_TTS_RESOURCE_ID`，并可通过 `VOLC_TTS_DISABLE_MARKDOWN_FILTER`、`VOLC_TTS_ENABLE_LATEX_TN` 控制额外特性。
- `VOLC_TTS_IGNORE_BRACKET_TEXT` 支持 JSON 数组或逗号分隔，示例 `[1,2]` 可过滤括号内内容。
- 可选的情感参数：设置 `VOLC_TTS_EMOTION` 及 `VOLC_TTS_EMOTION_INTENSITY`（0-1 范围）为大模型音色增加情感色彩。

VolcEngine docs for reference:

- <https://www.volcengine.com/docs/6348/1310560>
- <https://www.volcengine.com/docs/6348/106914>
