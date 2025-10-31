# Docker Build Guide

This guide covers building and running the demo entirely with Docker. You only need Docker/Podman installed—no local Bun, Node.js, or pnpm toolchain is required.

## 1. Prerequisites

1. Docker 24+ or Podman 4.6+ with Compose support.
2. `volc-server/.env` populated with valid Volc credentials (copy from `.env.example` and fill in the required values).
3. (Optional) override the frontend proxy host by exporting `VITE_AIGC_PROXY_HOST`. The default `http://localhost:3002` matches the local proxy container.

## 2. One-Command Local Preview

Build and start both the Volc proxy and the React UI:

```bash
docker compose up --build
```

The compose stack creates two containers:

- `mcp-volc-server` (Volc proxy) listening on `http://localhost:3002`
- `mcp-web` (UI) available at `http://localhost:8080`

Use `docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"` to confirm both containers are healthy.

Stop the stack with:

```bash
docker compose down
```

Add `--rmi local` to remove the locally built images as well.

## 3. Build Images Individually

### Volc Proxy (Bun)

```bash
docker build -t volc-server:local ./volc-server
docker run --env-file volc-server/.env -p 3002:3002 --name mcp-volc-local volc-server:local
```

### Web UI (React + Vite)

```bash
docker build -t mcp-web:local ./web
docker run -p 8080:80 --name mcp-web-local mcp-web:local
```

When running the frontend separately, ensure `VITE_AIGC_PROXY_HOST` was set to the correct backend URL during `docker build` (default matches the local proxy).

## 4. Working Without Bun or Node.js

All Bun, pnpm, and Vite steps execute inside the container build stages. You can develop or preview the project on a clean machine by:

1. Editing sources locally as usual.
2. Running `docker compose up --build` to rebuild images with the latest changes.
3. Refreshing the browser at `http://localhost:8080`.

If you need to install new npm dependencies, update `web/package.json`/`pnpm-lock.yaml` locally, then rebuild the image. The Dockerfile runs `pnpm install --frozen-lockfile`, so lockfile changes must be committed before the build.

## 5. Troubleshooting

- **Missing credentials**: Ensure `volc-server/.env` contains all required Volc keys before building or starting the proxy container.
- **Port conflicts**: Change the host ports in `docker-compose.yml` (e.g., `3002:3002` → `3003:3002`) and update `VITE_AIGC_PROXY_HOST` accordingly, then rebuild the web container.
- **Slow rebuilds**: Docker caches dependencies after the first build. Subsequent builds reuse the `bun install` and `pnpm install` layers unless package manifests change.

For more background on the system architecture, see [`README.md`](../README.md).
