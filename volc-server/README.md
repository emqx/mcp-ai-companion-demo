# Volc Voice Agent Proxy

Bun + TypeScript server that proxies VolcEngine AIGC real-time voice APIs.

- Exposes `/getScenes` and `/proxy` endpoints matching the Web client contract.
- Loads `src/scenes/*.json`, merges credentials from `.env`, autogenerates Room/User IDs and 24h RTC tokens.
- Signs VolcEngine TOP gateway requests and forwards `StartVoiceChat` / `StopVoiceChat`.

## 1. Prepare Environment

```bash
cd volc-server
cp .env.example .env
# Fill in:
# VOLC_ACCESS_KEY_ID / VOLC_SECRET_KEY
# VOLC_RTC_APP_ID / VOLC_RTC_APP_KEY
# Optional: VOLC_SCENE_DEFAULT (defaults to emq-mcp-ai-companion)
```

Add more scenes under `src/scenes/` if needed (see `emq-mcp-ai-companion.json` for structure).

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
│   ├── env.ts             # runtime env validation
│   ├── types.ts           # scene / API typings
│   ├── lib/token.ts       # RTC token generator
│   └── scenes/
│       ├── loader.ts      # scene loader & helpers
│       └── emq-mcp-ai-companion.json  # sample scene (EMQ MCP AI Companion)
├── .env.example
├── package.json
├── bunfig.toml
└── tsconfig.json
```

VolcEngine docs for reference:

- <https://www.volcengine.com/docs/6348/1310560>
- <https://www.volcengine.com/docs/6348/106914>
