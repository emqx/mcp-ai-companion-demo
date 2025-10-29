# VolcEngine RTC Integration Plan (Zustand-Based)

## Phase 0 — Current Snapshot

- **State Management**: Local `useState` in components/hooks; no Redux/Zustand yet.
- **Signaling**: WebRTC session established through MQTT (`useWebRTCMqtt` + `MqttWebRTCSignaling`). Media setup handled manually.
- **Agent Control**: Python service handles ASR/LLM/TTS; frontend publishes MQTT messages.
- **Server**: New Bun proxy (`volc-server`) already provides `/getScenes` & `/proxy` with Volc credentials.

## Phase 1 — Foundation (Zustand Stores & Scene Bootstrapping)

1. **Create Zustand stores**
   - `useSceneStore`: current scene id, config map, agent status, subtitles toggle, fullscreen flag.
   - `useRtcStore`: RTC credentials (AppId, RoomId, UserId, Token), join/leave status, device permissions.
   - `useDeviceStore`: available devices, selected mic/camera, volume/mute state.
2. **Scene bootstrap flow**
   - On `App` mount, call `volc-server/getScenes`; populate stores with scene data.
   - Store mapping should mirror `rtc-aigc-demo` (`sceneConfigMap`, `rtcConfigMap`). Default `sceneId` = `emq-mcp-ai-companion`.
3. **Config wiring**
   - ✅ `src/api/` has established basic request encapsulation and points to Bun proxy via `VITE_AIGC_PROXY_HOST`.
   - Next step: Combine with Zustand store to expose derived state (such as interrupt/vision/avatar flags).

## Phase 2 — RTC Client Integration

1. **Introduce Volc RTC SDK**
   - Install `@volcengine/rtc` and AI noise reduction extension; load within a reusable `rtcClient.ts` similar to demo.
   - Map existing hooks to new client methods (`joinRoom`, `leaveRoom`, `publishStream`, etc.).
2. **Refactor hooks**
   - Replace `useWebRTCMqtt` with `useRtcClient` hook that reads from Zustand stores, handles connect/disconnect, exposes toggles.
   - Migrate device permission logic (`checkPermission`, enumerate devices) into `useRtcDevice` hook using Volc APIs.
3. **Agent orchestration**
   - Implement `startAgent(sceneId)` / `stopAgent(sceneId)` via new API client hitting Bun `/proxy` endpoints.
   - Store agent status in `useSceneStore` to drive UI states (loading, interrupt mode).

## Phase 3 — UI & Interaction Alignment

1. **Main screen layout**
   - Reproduce `MainArea` behavior: lobby screen → joined room view; ensure Zustand state drives transitions.
2. **Controls & menus**
   - Add mic/camera/screen toggles, subtitle/interrupt toggles mirroring demo; connect to `useRtcStore` actions.
3. **Subtitle & message flow**
   - Subscribe to RTC binary messages (`string2tlv` equivalent) for transcript and agent events.
   - Replace MQTT-based ASR/TTS updates with data from Volc pipeline (sessionStorage `RequestID`, etc.).

## Phase 4 — Clean-up & Alignment

1. **Remove unused modules**
   - Deprecate `useWebRTCMqtt`, MQTT-based signaling services, Python agent hooks.
   - Update `App.tsx` to rely on new stores/hooks exclusively.
2. **Config & docs**
   - Add `.env` entries for `AIGC_PROXY_HOST`, AppId overrides.
   - Update README with new setup steps, Bun server reference, testing guidance.
3. **Testing**
   - Add manual test checklist: scene fetch, join/leave, interrupt, device switching, agent start/stop.
   - Optionally integrate automated smoke tests (Cypress or Playwright) for join/leave flow.

## Notes & Open Questions

- Confirm if existing MQTT hardware control should remain; if so, keep `useMcpMqttServer` for device commands while RTC uses Volc stack.
- Need asset/UI adjustments to match rtc demo (Arco components vs Tailwind/shadcn). Decide whether to port components or adapt existing UI.
- Verify browser support and permission prompts, especially for AI noise reduction extension compatibility.
