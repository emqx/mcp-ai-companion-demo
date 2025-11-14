# Volc Voice Agent Proxy

Bun + TypeScript server that proxies VolcEngine AIGC real-time voice APIs.

- Exposes `/getScenes` and `/proxy` endpoints matching the Web client contract
- Keeps secrets in `.env` while the rest of the scene/voice tuning lives in `src/config.ts`
- Autogenerates Room/User IDs and 24h RTC tokens
- Signs VolcEngine TOP gateway requests and forwards `StartVoiceChat` / `StopVoiceChat`

## 1. Prepare Environment

```bash
cd volc-server
cp .env.example .env
# Fill in the credential-only .env:
#   VOLC_ACCESS_KEY_ID / VOLC_SECRET_KEY
#   VOLC_RTC_APP_ID / VOLC_RTC_APP_KEY
#   VOLC_ASR_APP_ID / VOLC_TTS_APP_ID / VOLC_TTS_APP_TOKEN
#   VOLC_LLM_URL / VOLC_LLM_API_KEY (when using CustomLLM)
# Then edit src/config.ts for non-sensitive scene/voice/LLM parameters
```

Secrets stay out of version control in `.env`, while `src/config.ts` carries shareable defaults you can commit alongside the proxy. The loader now validates only the environment secrets, so you can add or tweak config fields without touching `env.ts`.

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
│   ├── config.ts          # Shared, non-sensitive runtime defaults
│   ├── env.ts             # Runtime environment validation + credential merge
│   ├── types.ts           # Scene / API typings
│   ├── handlers.ts        # HTTP request handlers
│   ├── lib/
│   │   └── token.ts       # RTC token generator
│   └── scenes/
│       └── loader.ts      # Scene builder from environment variables
├── .env.example           # Credential-only template
├── .env                   # Actual secrets (gitignored)
├── package.json
├── bunfig.toml
└── tsconfig.json
```

## 6. Configuration

Runtime settings are now split between two files:

- `.env`: **secrets only** (`VOLC_ACCESS_KEY_ID`, `VOLC_SECRET_KEY`, `VOLC_RTC_APP_ID`, `VOLC_RTC_APP_KEY`, `VOLC_ASR_APP_ID`, `VOLC_TTS_APP_ID`, `VOLC_TTS_APP_TOKEN`, `VOLC_TTS_RESOURCE_ID`, `VOLC_LLM_URL`, `VOLC_LLM_API_KEY`).
- `src/config.ts`: **non-sensitive scene/voice/LLM parameters** expressed with the same field names used by Volc StartVoiceChat payloads (e.g. `ASRConfig.Provider`, `ASRConfig.VADConfig.SilenceTime`, `TTSConfig.Mode`, `LLMConfig.ModelName`, etc.), plus local metadata such as agent persona and scene details.

See `.env.example` plus the inline comments inside `src/config.ts` for the latest defaults. Because `src/config.ts` exports the same `VOLC_*` keys, the rest of this document still refers to each option by its familiar name.

`VOLC_INTERRUPT_KEYWORDS` is now edited as a literal array inside `src/config.ts`. The stock list already covers common Chinese and English interrupt phrases such as "谢谢", "停", and "Stop".

### ASRConfig quick reference

`config.ts` follows the official ASR schema (see “语音识别配置” in the Volc docs). When you tweak ASR behavior, update the `asrConfig` block directly:

```ts
export const runtimeConfig = {
  // ...
  asrConfig: {
    Provider: 'volcano',
    ProviderParams: {
      Mode: 'smallmodel',
      Cluster: 'volcengine_streaming_common',
      // AccessToken / ApiResourceId stay in .env if needed
    },
    VADConfig: {
      SilenceTime: 600,
      // PrefixTime / SuffixTime / AIVAD available if you need fine‑grained control
    },
    VolumeGain: 0.5,
    TurnDetectionMode: 0,
  },
}
```

This maps 1‑to‑1 to the `StartVoiceChat.ASRConfig` payload, making it easy to copy snippets from the Volc documentation.

### CustomLLM integration

Set `llmConfig.Mode` to `CustomLLM` inside `src/config.ts` when you want VolcEngine to call a third-party agent instead of an Ark endpoint. Keep the actual endpoint and token in `.env`.

- `VOLC_LLM_URL` (required): HTTPS endpoint of your agent (must support SSE and return `data: [DONE]`).
- `VOLC_LLM_API_KEY` (optional): forwarded as `Authorization: Bearer <token>`.
- `LLMConfig.ModelName`, `LLMConfig.Temperature`, `LLMConfig.TopP`, `LLMConfig.MaxTokens`, `LLMConfig.HistoryLength`, `LLMConfig.ExtraHeaders`, `LLMConfig.StreamOptions`, `LLMConfig.UserPrompts`: edit these fields in `src/config.ts` to control how the payload is built.

Config snippet for a locally hosted agent:

```ts
export const runtimeConfig = {
  // ...
  llmConfig: {
    Mode: 'CustomLLM',
    ModelName: 'qwen-flash',
    Temperature: 0.7,
    TopP: 0.9,
    MaxTokens: 512,
    HistoryLength: 5,
    EnableRoundId: true,
    StreamOptions: { include_usage: true },
  },
  // ...
}
```

`.env` still carries the endpoint and key:

```env
VOLC_LLM_URL=https://demo.emqx.com:8081/chat-stream
VOLC_LLM_API_KEY=4ecf5336172f1a715196f8bbd35df00d
```

### Selecting a natural TTS profile

Head to `ttsConfig` inside `src/config.ts` to pick the voice profile that best matches your scene:

- `TTSConfig.Mode`:
  - `standard` (default) uses the traditional Volc streaming TTS, which maps to `speed_ratio/pitch_ratio/volume_ratio`.
  - `bigtts` uses a large TTS synthesis model (more natural and expressive), automatically mapped to `speech_ratio/pitch_rate`.
  - `bidirection` connects to a streaming large model and still requires `VOLC_TTS_APP_TOKEN` and `VOLC_TTS_RESOURCE_ID` in `.env`. Additional features can be toggled via `TTSConfig.DisableMarkdownFilter` and `TTSConfig.EnableLatexTn`.
- `TTSConfig.IgnoreBracketText` remains an array; set `[1,2]` to filter bracketed text.
- Optional emotion parameters: set `TTSConfig.Emotion` and `TTSConfig.EmotionIntensity` (range 0–1) to add emotional coloring to the large-model voice.

VolcEngine docs for reference:

- <https://www.volcengine.com/docs/6348/1310560>
- <https://www.volcengine.com/docs/6348/106914>
