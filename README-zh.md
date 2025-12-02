# 硬件智能体演示项目

基于 EMQX MCP、Agent、LLM、VLM、ASR 和 TTS 技术的硬件智能体演示项目。适用于情感陪伴玩具、智能家电、智能家居和具身智能等应用场景。

## 项目简介

该项目实现了一个功能完整的智能体，用户能够通过语音和视觉与用户进行自然交互，并控制各种智能设备。该智能体具备以下核心能力：

- **语音识别与合成**：接入语音流，实现实时语音识别和自然语音合成
- **视觉理解**：基于图片识别的多模态大模型 (VLM) 进行视觉内容理解
- **智能推理**：结合 LLM 和 Agent 技术，生成符合人物设定的智能回复
- **设备控制**：通过 MCP over MQTT 协议控制摄像头、扬声器等外设

## 系统架构

![系统架构图](docs/sys_arch.png)

## 技术特点

- **MQTT 通信**：基于 MQTT 协议实现数据上报和设备控制，具备低延时、轻量、节能等优势
- **智能控制**：根据 LLM 推理结果，通过 MCP over MQTT 控制硬件设备，提升智能化程度
- **多媒体流**：基于 WebRTC 的稳定多媒体流服务，支持语音活动检测 (VAD) 和语音打断
- **灵活扩展**：高度灵活的 Agent 实现，可接入各种第三方模型，支持自定义业务逻辑
- **私有部署**：支持全球多地就近接入，提升安全性，有效控制成本

## 快速开始（火山代理 + Web UI + app）

1. 下载仓库代码

```shell
git clone https://github.com/emqx/mcp-ai-companion-demo.git
cd mcp-ai-companion-demo
```

2. 准备环境变量：
   - 复制 `app/.env.example` 为 `app/.env`（AI Agent 层），填写 `DASHSCOPE_API_KEY`、`CUSTOM_LLM_API_KEY`，以及可选的上传配置。
   - 复制 `volc-server/.env.example` 为 `volc-server/.env`，填写火山凭据；设置 `VOLC_LLM_URL=http://app:8081/chat-stream`，`VOLC_LLM_API_KEY` 与 `CUSTOM_LLM_API_KEY` 保持一致，便于代理调用 app。
   - 在 `app/.env` 填写 MQTT Broker（默认 `localhost:1883`，如需变更则改 `MQTT_BROKER_HOST`/`MQTT_BROKER_PORT`，鉴权则填 `MQTT_USERNAME`/`MQTT_PASSWORD`）。
   - 进阶可选：可在 `app/.env` 调整 MCP 发现/前缀（`MCP_SERVER_NAME_PREFIX`、`MCP_SERVER_DISCOVERY_FILTER`、`MCP_REGISTRY_CLIENT_NAME`，留空则使用默认）。
   - 如需为 app 启用 HTTPS（生产建议），可将证书挂载到容器（例如 `./certs:/certs:ro`），并在 `app/.env` 或 compose 环境变量中设置 `APP_SSL_CERTFILE` / `APP_SSL_KEYFILE` 为挂载路径；默认本地为 HTTP。

3. 一键启动火山代理 + Web UI + app：

```bash
docker compose -f docker/docker-compose.web-volc.yml up --build
```

4. 打开 `http://localhost:8080` 访问前端；app 服务运行在 `http://localhost:8081`，火山代理在 `http://localhost:3002`。

当前提供两套 Compose 文件：

- `docker/docker-compose.web-volc.yml` —— 推荐，包含 Volc 代理 + Web UI + app（AI Agent 层）。
- `docker/docker-compose.legacy.yml` —— 自建 RTC 旧版媒体栈（Postgres + media server + EMQX，非火山方案）。

### 本地预览（Volc 代理 + Web UI + app）

使用 Docker 启动 Volc 实时语音代理、Web 界面和 app：

1. 确保 `app/.env` 已存在（复制 `.env.example`，填写 `DASHSCOPE_API_KEY`、`CUSTOM_LLM_API_KEY` 等）。
2. 确保 `volc-server/.env` 已存在（复制 `.env.example`，填写火山凭据，并设置 `VOLC_LLM_URL=http://app:8081/chat-stream`，`VOLC_LLM_API_KEY` 与 `CUSTOM_LLM_API_KEY` 一致）。
3. （可选）设置环境变量 `VITE_AIGC_PROXY_HOST` 覆盖 Web 构建时接口地址，默认值 `http://localhost:3002` 与端口映射一致。
4. 构建并启动服务：

```bash
docker compose -f docker/docker-compose.web-volc.yml up --build
```

5. 打开 `http://localhost:8080` 访问 Web 界面。app 服务在 `http://localhost:8081`，Volc 代理在 `http://localhost:3002`。

Compose 启动后会生成 `mcp-app`、`mcp-volc-server`、`mcp-web` 三个容器，方便通过 `docker ps` 区分各服务。

## 项目结构

### web

智能体前端界面，提供用户交互界面和设备控制功能。基于 React + TypeScript + Vite + Tailwind CSS + shadcn/ui + MQTT.js，实现 MCP over MQTT 协议通信。

**要求**: Node.js >= 22.0.0

```bash
cd web
pnpm install
pnpm dev
```

可选：复制 `.env.example` 为 `.env` 并通过 `VITE_AIGC_PROXY_HOST` 变量覆盖 Volc 代理地址。默认值会根据当前页面地址推导，本地开发通常无需修改。

### app

Python 实现的后台 Agent 服务，现以 HTTP SSE 接口为主要接入方式。

**要求**：Python >= 3.11，`uv`

#### 启动 HTTP SSE 服务

```bash
cd app
uv sync
uv run --env-file .env python custom_llm_service.py \
  --host 0.0.0.0 \
  --port 8081
```

- 每个 HTTP 请求都必须携带 `device_id`（可放在顶层字段或 `custom` JSON 中）。服务在首次收到某个设备 ID 时会初始化 MCP、加载工具，后续同一设备会直接复用既有连接，会话间互不干扰。
- 当暂未检测到 MCP 工具时，会自动退回纯文本回复（不执行设备控制），避免直接报错。
- 可通过环境变量 `MCP_TOOLS_WAIT_SECONDS`（默认 2 秒）控制等待 MCP 工具加载的时长；超时后立即进入纯文本模式。
- API：`POST /chat-stream`，请求体为 OpenAI Chat 兼容格式 `messages`，响应为 SSE (`data: ...` + `data: [DONE]`)。

#### CLI 模式（兼容旧流程）

保留 `main.py` 供原有 JSON-RPC/STDIN 控制链路使用：

```bash
cd app
uv sync
uv run --env-file .env python main.py
```

## 联系我们

如果您对该演示项目或解决方案感兴趣，想了解商业化的产品和服务，请[联系我们](https://www.emqx.com/zh/contact)。
