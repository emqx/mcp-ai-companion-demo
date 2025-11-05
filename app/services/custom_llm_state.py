from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass, field, replace
from typing import Any, Dict, Optional, Callable

import anyio

from conversation_workflow import ConversationWorkflow
from mcp_client_init import McpServerRegistry
from mcp.shared.mqtt import MqttOptions
from utils.config import LLMSettings

logger = logging.getLogger(__name__)


def sanitize_for_log(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    return value.replace("\n", "").replace("\r", "")


@dataclass
class DeviceSession:
    workflow: ConversationWorkflow
    lock: anyio.Lock
    device_id: Optional[str]
    initialized: bool = False
    last_used: float = field(default_factory=lambda: time.time())

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


class ServiceState:
    """Manage ConversationWorkflow sessions per device for MCP interactions."""

    def __init__(
        self,
        settings: LLMSettings,
        *,
        workflow_factory: Optional[Callable[[LLMSettings], ConversationWorkflow]] = None,
    ) -> None:
        self.settings = settings
        self.workflow_factory = workflow_factory
        self.mcp_server_name_prefix = os.getenv("MCP_SERVER_NAME_PREFIX", "web-ui-hardware-controller/")

        mqtt_host = os.getenv("MQTT_BROKER_HOST") or "localhost"
        mqtt_port = int(os.getenv("MQTT_BROKER_PORT") or 1883)
        mqtt_username = os.getenv("MQTT_USERNAME") or None
        mqtt_password = os.getenv("MQTT_PASSWORD") or None
        self._mqtt_options = MqttOptions(
            host=mqtt_host,
            port=mqtt_port,
            username=mqtt_username,
            password=mqtt_password,
        )
        registry_client_name = os.getenv("MCP_REGISTRY_CLIENT_NAME", "ai_companion_registry")
        registry_filter = os.getenv("MCP_SERVER_DISCOVERY_FILTER") or f"{self.mcp_server_name_prefix}#"
        registry_client_id = (os.getenv("MCP_REGISTRY_CLIENT_ID") or "").strip() or None
        self.registry = McpServerRegistry(
            mqtt_options=self._mqtt_options,
            client_name=registry_client_name,
            server_name_prefix=self.mcp_server_name_prefix,
            server_name_filter=registry_filter,
            clientid=registry_client_id,
        )

        self.sessions: Dict[str, DeviceSession] = {}
        # Registry lock guards session map mutations; per-session locks live on DeviceSession
        self.registry_lock = anyio.Lock()
        # Backwards compatibility with previous attribute name
        self.lock = self.registry_lock

    async def start(self) -> None:
        await self.registry.ensure_started()

    async def shutdown(self) -> None:
        sessions: list[DeviceSession] = []
        async with self.registry_lock:
            sessions.extend(self.sessions.values())

        for session in sessions:
            try:
                await session.workflow.shutdown()
            except Exception as exc:  # pragma: no cover - defensive cleanup
                logger.warning(
                    "Failed to shutdown workflow for device '%s': %s",
                    sanitize_for_log(session.device_id),
                    exc,
                )

        await self.registry.stop()

    async def ensure_mcp(self, device_id: Optional[str]) -> DeviceSession:
        if not device_id:
            raise RuntimeError("device_id is required to initialize MCP")

        return await self._ensure_session_for_device(device_id)

    async def _ensure_session_for_device(self, device_id: str) -> DeviceSession:
        session = await self._get_or_create_session(device_id)
        await self._prepare_session(session, device_id)
        session.last_used = time.time()
        return session

    async def _get_or_create_session(self, device_id: str) -> DeviceSession:
        async with self.registry_lock:
            existing = self.sessions.get(device_id)
            if existing:
                return existing

            workflow = self._create_workflow(device_id=device_id)
            session = DeviceSession(workflow=workflow, lock=anyio.Lock(), device_id=device_id)
            self.sessions[device_id] = session
            return session

    def _clone_settings(self) -> LLMSettings:
        cloned = replace(self.settings)
        if cloned.custom_options:
            cloned.custom_options = replace(cloned.custom_options)
        return cloned

    def _create_workflow(self, device_id: Optional[str]) -> ConversationWorkflow:
        settings_clone = self._clone_settings()
        if self.workflow_factory:
            try:
                workflow = self.workflow_factory(settings_clone)
            except TypeError:
                workflow = self.workflow_factory()
        else:
            workflow = ConversationWorkflow(llm_settings=settings_clone, device_id=device_id)

        if device_id and getattr(workflow, "device_id", None) is None:
            workflow.device_id = device_id

        return workflow

    async def _prepare_session(self, session: DeviceSession, device_id: str) -> None:
        await self.registry.ensure_started()

        workflow = session.workflow
        server_name = self._derive_server_filter(device_id)
        wait_env = os.getenv("MCP_SERVER_WAIT_SECONDS") or os.getenv("MCP_TOOLS_WAIT_SECONDS")
        try:
            wait_timeout = float(wait_env) if wait_env else 0.0
        except ValueError:
            wait_timeout = 0.0

        tools = self.registry.get_tools_now(server_name)
        if not tools and wait_timeout > 0:
            tools = await self.registry.wait_for_tools(server_name, timeout=wait_timeout)

        workflow.configure_mcp(
            mcp_client=self.registry.client,
            device_id=device_id,
            server_name=server_name,
            tools=tools,
        )
        session.initialized = True

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

    def snapshot_voice_agent_state(self, session: DeviceSession) -> Dict[str, Any]:
        return session.snapshot_voice_agent_state()

    def restore_voice_agent_state(self, session: DeviceSession, snapshot: Dict[str, Any]) -> None:
        session.restore_voice_agent_state(snapshot)
