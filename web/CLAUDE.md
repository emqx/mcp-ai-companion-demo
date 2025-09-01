# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Code Can Not Use Chinese Comment!!!!!!

## Commands

### Development

```bash
# Start development server with hot reload
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview

# Run linting
pnpm lint
```

### shadcn/ui Components

```bash
# Add new shadcn/ui components
pnpm dlx shadcn@latest add <component-name>

# Example: Add a card component
pnpm dlx shadcn@latest add card
```

## Related Projects

### Backend API Server

The backend for this frontend is located at:

- **Path Pattern**: Look for `emqx-multimedia-proxy` in sibling or parent directories (Not Current Project, Current Project is `mcp-ai-companion-demo` !!!!!!!)
- **Current Known Path**: `/Users/ysfscream/Workspace/EMQ/emqx-multimedia-proxy`
- **Project Type**: Elixir/Phoenix umbrella application
- **Description**: Multimedia proxy server with WebRTC, RTP processing, ASR/TTS capabilities

This frontend calls the backend API for multimedia processing features.

## Documentation

### Protocol Implementation Guides

- **MCP over MQTT**: `docs/mcp-over-mqtt-implementation.md` - Complete implementation guide for MCP Server functionality
- **WebRTC over MQTT**: `docs/webrtc-mqtt-integration.md` - Integration guide for WebRTC signaling via MQTT

**IMPORTANT**: When working with MQTT connections, WebRTC signaling, or MCP protocol implementations, ALWAYS refer to these documentation files first to understand the current architecture and implementation patterns.

## Architecture

This is a Vite + React + TypeScript application with Tailwind CSS v4 and shadcn/ui components.

### Core Stack

- **React 19.1.1** - UI framework
- **TypeScript 5.8.3** - Type safety
- **Vite 7.1.2** - Build tool and dev server
- **Tailwind CSS 4.1.12** - Utility-first CSS framework
- **shadcn/ui** - Component library built on Radix UI
- **pnpm** - Package manager

### Project Structure

- `src/main.tsx` - Application entry point
- `src/App.tsx` - Main React component with MCP and WebRTC integration
- `src/components/ui/` - shadcn/ui components
- `src/components/ChatInterface.tsx` - Main chat interface with WebRTC controls
- `src/hooks/useMcpMqttServer.ts` - MCP over MQTT server hook
- `src/hooks/useWebRTCMqtt.ts` - WebRTC over MQTT client hook
- `src/lib/mcp-mqtt-server.ts` - MCP MQTT server implementation
- `src/services/mqtt-webrtc-signaling.ts` - WebRTC signaling service
- `src/config/mqtt.ts` - Unified MQTT configuration
- `src/config/webrtc.ts` - WebRTC configuration
- `src/utils/logger.ts` - Logging system with categorized loggers
- `src/types/mqtt.ts` - MQTT and MCP type definitions
- `src/types/webrtc.ts` - WebRTC type definitions
- `docs/` - Protocol implementation documentation
- `vite.config.ts` - Vite configuration with Tailwind plugin and path aliases
- `tsconfig.app.json` - Application TypeScript config with @/* path mapping
- `eslint.config.js` - Linting rules
- `components.json` - shadcn/ui configuration

### Key Configuration Notes

- **Path Aliases**: Use `@/*` to import from `src/` (e.g., `import { Button } from '@/components/ui/button'`)
- **Tailwind CSS v4**: Uses `@tailwindcss/vite` plugin, no config file needed
- **shadcn/ui**: Configured with Neutral base color theme
- **CSS Variables**: Uses oklch color format for modern color management
- **TypeScript**: Strict mode enabled with path mapping configured
- **ESLint**: Configured with React hooks and refresh plugins
- **No testing framework currently configured**
