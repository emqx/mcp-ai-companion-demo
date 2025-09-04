# CLAUDE.md

这是一个基于 EMQX MCP、Agent、LLM、VLM、ASR 和 TTS 技术的硬件智能代理演示项目。

## 项目结构

- `app/` - 智能代理核心代码，包含与多媒体服务的交互以及调用和与 LLM、VLM 交互的实现
- `web/` - 前端界面，提供用户交互和设备控制功能

## 技术栈

### Backend (app/)

- **Python** >= 3.11
- **uv** - 包管理器
- **FastAPI** - Web 框架
- **LlamaIndex** - LLM 集成框架
- **OpenAI/SiliconFlow** - LLM 服务
- **MCP (Model Context Protocol)** - 通过 MQTT 协议实现设备控制
- **MQTT** - 消息传输协议

### Frontend (web/)

- **Node.js** >= 22.0.0
- **React + TypeScript**
- **Vite** - 构建工具
- **Tailwind CSS** + **shadcn/ui** - UI 框架
- **MQTT.js** - MQTT 客户端

## 主要功能

1. **语音识别与合成** - 集成语音流，实现实时语音识别和自然语音合成
2. **视觉理解** - 利用多模态大模型(VLM)实现基于图像的视觉内容理解
3. **智能推理** - 结合 LLM 和 Agent 技术，生成符合角色设定的智能回应
4. **设备控制** - 通过 MCP over MQTT 协议控制摄像头、音响等外设

## 开发命令

### Backend

```bash
cd app
uv sync          # 安装依赖
uv run main.py   # 运行主程序
```

### Frontend

```bash
cd web
pnpm install     # 安装依赖
pnpm dev         # 开发服务器
```

## 环境变量

- `MQTT_CLIENT_ID` - MQTT 客户端 ID
- `MQTT_BROKER_HOST` - MQTT 服务器地址 (默认: localhost)
- `MQTT_BROKER_PORT` - MQTT 服务器端口 (默认: 1883)

## 架构说明

系统采用事件驱动架构：

- 主程序通过 JSON-RPC 协议与外部服务通信
- ASR 服务识别语音输入，放入 asr_queue
- Agent 处理用户输入，生成回应
- TTS 服务合成语音输出，通过 tts_queue 处理
- MCP 客户端通过 MQTT 协议控制硬件设备

## 关键文件

- `app/main.py` - 主程序入口，处理消息队列和事件循环
- `app/agents.py` - MCP 客户端初始化和 Agent 集成
- `app/mcp_client_init.py` - MCP MQTT 客户端初始化
