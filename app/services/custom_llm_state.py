from __future__ import annotations

import logging
import os
from typing import Any, Dict, Optional, Callable

import anyio

from conversation_workflow import ConversationWorkflow
from utils.config import LLMSettings

logger = logging.getLogger(__name__)


class ServiceState:
    """Encapsulates ConversationWorkflow lifecycle and MCP bindings."""

    def __init__(
        self,
        settings: LLMSettings,
        *,
        default_device_id: Optional[str] = None,
        workflow_factory: Optional[Callable[[LLMSettings], ConversationWorkflow]] = None,
    ) -> None:
        self.settings = settings
        if workflow_factory:
            try:
                self.workflow = workflow_factory(settings)
            except TypeError:
                self.workflow = workflow_factory()
        else:
            self.workflow = ConversationWorkflow(llm_settings=settings)
        self.lock = anyio.Lock()
        self.default_device_id = default_device_id or os.getenv("CUSTOM_LLM_DEVICE_ID")
        self.mcp_server_name_prefix = os.getenv("MCP_SERVER_NAME_PREFIX", "web-ui-hardware-controller/")

    async def shutdown(self) -> None:
        try:
            await self.workflow.shutdown()
        except Exception as exc:  # pragma: no cover - defensive cleanup
            logger.warning("Failed to shutdown workflow cleanly: %s", exc)

    async def ensure_mcp(self, device_id: Optional[str]) -> None:
        target_device = device_id or self.default_device_id

        if self.workflow.mcp_client and self.workflow.mcp_client.mcp_tools:
            current_device = self.workflow.device_id or self.default_device_id
            if target_device and current_device and current_device != target_device:
                logger.warning(
                    "Workflow already bound to device '%s'; ignoring new device_id '%s'",
                    current_device,
                    target_device,
                )
            return

        if target_device:
            server_name_filter = self._derive_server_filter(target_device)
            if self.workflow.mcp_client:
                await self.workflow.mcp_client.load_mcp_tools(server_name_filter)
                if self.workflow.mcp_client.mcp_tools:
                    self.default_device_id = target_device
                    if not self.workflow.device_id:
                        self.workflow.device_id = target_device
                    logger.info("MCP tools loaded for existing connection '%s'", target_device)
                    return
            logger.info("Initializing MCP with device_id=%s filter=%s", target_device, server_name_filter)
            await self.workflow.init_mcp(server_name_filter=server_name_filter, device_id=target_device)
            self.default_device_id = target_device
            return

        await self._auto_discover_tools()

    def _derive_server_filter(self, device_id: str) -> str:
        if device_id.startswith(self.mcp_server_name_prefix):
            return device_id
        if "/" in device_id:
            suffix = device_id.rsplit("/", 1)[-1]
        elif "-" in device_id:
            suffix = device_id.split("-")[-1]
        else:
            suffix = device_id
        return f"{self.mcp_server_name_prefix}{suffix}"

    async def _auto_discover_tools(self) -> None:
        logger.info("Attempting MCP auto-discovery via presence topics")

        if not self.workflow.mcp_client:
            await self.workflow.init_mcp(server_name_filter="#", device_id=None)

        mcp_client = self.workflow.mcp_client
        if not mcp_client:
            logger.warning("Unable to create MCP client for discovery")
            return

        max_wait = 12.0
        interval = 0.5
        elapsed = 0.0
        discovered_server = None

        while elapsed < max_wait:
            alive_servers = mcp_client.get_alive_mcp_servers()
            if alive_servers:
                discovered_server = alive_servers[0]
                break
            await anyio.sleep(interval)
            elapsed += interval

        if not discovered_server:
            logger.warning("Auto discovery timed out after %.1fs", max_wait)
            return

        logger.info("Discovered MCP server '%s'; attempting to load tools", discovered_server.server_name)
        await mcp_client.load_mcp_tools(discovered_server.server_name)

        if mcp_client.mcp_tools:
            self.default_device_id = discovered_server.server_name
            self.workflow.device_id = discovered_server.server_name
            logger.info("MCP tools loaded from '%s'", discovered_server.server_name)

    def snapshot_voice_agent_state(self) -> Dict[str, Any]:
        voice_agent = self.workflow.voice_agent
        return {
            "temperature": voice_agent.temperature,
            "top_p": voice_agent.top_p,
            "max_tokens": voice_agent.max_tokens,
            "model": voice_agent.model,
            "custom_payload": dict(voice_agent.custom_payload),
            "device_id": voice_agent.device_id,
        }

    def restore_voice_agent_state(self, snapshot: Dict[str, Any]) -> None:
        voice_agent = self.workflow.voice_agent
        voice_agent.temperature = snapshot["temperature"]
        voice_agent.top_p = snapshot["top_p"]
        voice_agent.max_tokens = snapshot["max_tokens"]
        voice_agent.model = snapshot["model"]
        voice_agent.custom_payload = dict(snapshot["custom_payload"])
        voice_agent.device_id = snapshot["device_id"]
