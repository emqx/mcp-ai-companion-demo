import os
import time
import json
import random
import string
import anyio
from typing import Optional, AsyncGenerator, Dict, Any, Sequence
from dataclasses import dataclass, replace
from enum import Enum

from mcp_client_init import McpMqttClient, _tool_signature
from llama_index.core.tools import BaseTool
from mcp.shared.mqtt import MqttOptions
from agents.emotion_agent import EmotionAgent
from agents.voice_agent import VoiceAgent
from utils.colored_logger import get_agent_logger
from utils.config import LLMSettings, get_llm_settings

logger = get_agent_logger("chat")

MAX_MQTT_CLIENT_ID_LENGTH = 23


def _generate_default_client_id() -> str:
    """Generate a short, MQTT-safe client ID (<=23 chars)."""
    suffix = "".join(random.choices(string.ascii_lowercase + string.digits, k=8))
    return f"mcpapp-{suffix}"


def _prepare_mqtt_client_id(raw_value: Optional[str]) -> str:
    """Sanitize and normalize MQTT client IDs to avoid broker rejections."""
    client_id = (raw_value or "").strip()
    if not client_id:
        client_id = _generate_default_client_id()

    sanitized = "".join(ch if ch.isalnum() or ch in "-_" else "-" for ch in client_id)
    if not sanitized:
        sanitized = _generate_default_client_id()

    if len(sanitized) > MAX_MQTT_CLIENT_ID_LENGTH:
        logger.warning(
            "MQTT client ID '%s' exceeds %s characters; trimming to comply with broker limits",
            sanitized,
            MAX_MQTT_CLIENT_ID_LENGTH,
        )
        sanitized = sanitized[:MAX_MQTT_CLIENT_ID_LENGTH]

    return sanitized


class ResponseType(Enum):
    STREAM_CHUNK = "stream_chunk"
    STREAM_END = "stream_end"
    TOOL_CALL = "tool_call"
    ERROR = "error"


@dataclass
class AgentResponse:
    type: ResponseType
    content: str = ""
    tool_name: Optional[str] = None
    tool_args: Optional[Dict[str, Any]] = None
    tool_result: Optional[str] = None


class ConversationWorkflow:
    """Conversation workflow that coordinates voice responses and tool calls"""

    def __init__(
        self,
        api_key: str | None = None,
        api_base: str | None = None,
        model: str | None = None,
        voice_prompt_file: str = "prompts/voice_reply_system_prompt.txt",
        tool_prompt_file: str = "prompts/emotion_system_prompt.txt",
        temperature: float | None = None,
        max_tokens: int | None = None,
        device_id: Optional[str] = None,
        llm_settings: Optional[LLMSettings] = None,
    ):
        base_settings = llm_settings or get_llm_settings()
        self.llm_settings = replace(base_settings)
        if self.llm_settings.custom_options:
            self.llm_settings.custom_options = replace(self.llm_settings.custom_options)

        if api_key:
            self.llm_settings.api_key = api_key
        if api_base:
            self.llm_settings.api_base = api_base
        if model:
            self.llm_settings.model = model
        if temperature is not None:
            self.llm_settings.temperature = temperature
        if max_tokens is not None:
            self.llm_settings.max_tokens = max_tokens

        self.device_id = device_id

        custom_options = self.llm_settings.custom_options
        history_length = custom_options.history_length if custom_options else self.llm_settings.history_length
        enable_round_id = custom_options.enable_round_id if custom_options else self.llm_settings.enable_round_id
        custom_payload = custom_options.custom_payload if custom_options else {}

        voice_api_key = self.llm_settings.api_key or os.getenv("LLM_API_KEY") or os.getenv("DASHSCOPE_API_KEY")
        voice_api_base = self.llm_settings.api_base or os.getenv("LLM_API_BASE")

        self.voice_agent = VoiceAgent(
            temperature=self.llm_settings.temperature,
            top_p=self.llm_settings.top_p,
            max_tokens=self.llm_settings.max_tokens,
            history_length=history_length,
            system_prompt_file=voice_prompt_file,
            system_messages=self.llm_settings.system_messages,
            user_prompts=self.llm_settings.user_prompts,
            enable_round_id=enable_round_id,
            custom_payload=custom_payload,
            device_id=device_id,
            model=self.llm_settings.model,
            api_key=voice_api_key,
            api_base=voice_api_base,
        )

        self.emotion_agent = EmotionAgent(
            system_prompt_file=tool_prompt_file,
            temperature=0.0,
            max_tokens=1000,
            api_key=os.getenv("EMOTION_LLM_API_KEY") or os.getenv("DASHSCOPE_API_KEY"),
            api_base=os.getenv("EMOTION_LLM_API_BASE") or os.getenv("LLM_API_BASE"),
            model=os.getenv("EMOTION_LLM_MODEL") or os.getenv("LLM_MODEL"),
        )

        self.mcp_client: Optional[McpMqttClient] = None
        self._current_server_name: Optional[str] = None
        self._active_tool_signature: Optional[tuple[str, ...]] = None
        self._owns_mcp_client = False

        logger.info("initialized with provider=%s", self.llm_settings.provider)
        self.tg: anyio.abc.TaskGroup | None = None
        self._tg_entered = False

    def _reinit_agents(
        self,
        server_name: Optional[str] = None,
        tools: Optional[Sequence[BaseTool]] = None,
    ) -> None:
        """Refresh agent bindings when MCP tools change."""

        if not self.mcp_client:
            return

        logger.info(
            "Reinitializing agents with updated MCP tools (server=%s)",
            server_name or self._current_server_name,
        )

        resolved_tools: Sequence[BaseTool]
        if tools is not None:
            resolved_tools = tools
        elif server_name:
            resolved_tools = self.mcp_client.get_tools_for_server(server_name)
        else:
            resolved_tools = getattr(self.mcp_client, "mcp_tools", [])

        self.configure_mcp(
            mcp_client=self.mcp_client,
            device_id=self.device_id,
            server_name=server_name or self._current_server_name,
            tools=resolved_tools,
        )

        logger.info("Agents reinitialized successfully")

    def configure_mcp(
        self,
        *,
        mcp_client: Optional[McpMqttClient],
        device_id: Optional[str],
        server_name: Optional[str],
        tools: Sequence[BaseTool],
    ) -> None:
        """Bind workflow to shared MCP client and tool set."""

        tools_list = list(tools) if tools else []
        signature = _tool_signature(tools_list)

        self.mcp_client = mcp_client
        self.device_id = device_id
        self._current_server_name = server_name

        if (
            self._active_tool_signature == signature
            and self.emotion_agent.mcp_client is mcp_client
            and self.voice_agent.mcp_client is mcp_client
        ):
            # Nothing new to apply
            return

        self._active_tool_signature = signature
        self.emotion_agent.update_mcp_context(mcp_client, tools_list)
        self.voice_agent.update_mcp_context(mcp_client, tools_list)

    async def init_mcp(
        self,
        server_name_filter: str = "#",
        device_id: Optional[str] = None
    ):
        """Initialize MCP client"""
        device_to_use = device_id or self.device_id

        mqtt_options = MqttOptions(
            host=os.getenv("MQTT_BROKER_HOST") or "localhost",
            port=int(os.getenv("MQTT_BROKER_PORT") or 1883),
            username=None,
            password=None,
        )

        mqtt_clientid = _prepare_mqtt_client_id(os.getenv("MQTT_CLIENT_ID") or f"mcp_ai_companion_{os.getpid()}")

        self.mcp_client = McpMqttClient(
            mqtt_options=mqtt_options,
            client_name="ai_companion_demo",
            server_name_filter=server_name_filter,
            clientid=mqtt_clientid,
            device_id=device_to_use,
            on_tools_updated=self._reinit_agents
        )
        self._owns_mcp_client = True

        # Start MCP
        if self.tg is None:
            self.tg = anyio.create_task_group()
            self._tg_entered = False
        if not self._tg_entered:
            await self.tg.__aenter__()
            self._tg_entered = True
        self.tg.start_soon(self.mcp_client.start)

        # Wait for connection
        connected = await self.mcp_client.connect()
        if connected:
            logger.info(f"MCP connected with device {device_to_use}")
            self.device_id = device_to_use

            # Wait for tools to load (short timeout; fallback to plain LLM if none)
            try:
                max_wait_time = float(os.getenv("MCP_TOOLS_WAIT_SECONDS", "2"))
            except ValueError:
                max_wait_time = 2.0
            wait_interval = 0.5  # seconds
            waited_time = 0

            while waited_time < max_wait_time:
                current_tools = self.mcp_client.get_tools_for_server(server_name_filter)
                if not current_tools:
                    current_tools = self.mcp_client.mcp_tools

                if current_tools:
                    tool_names = [
                        tool.metadata.name
                        if hasattr(tool, "metadata") and hasattr(tool.metadata, "name")
                        else str(tool)
                        for tool in current_tools
                    ]
                    logger.info(
                        "MCP tools loaded (%s): %s",
                        len(tool_names),
                        ", ".join(tool_names) if tool_names else "[unknown]",
                    )

                    self.configure_mcp(
                        mcp_client=self.mcp_client,
                        device_id=device_to_use,
                        server_name=server_name_filter,
                        tools=current_tools,
                    )
                    break

                await anyio.sleep(wait_interval)
                waited_time += wait_interval
                logger.debug(f"waiting for MCP tools... ({waited_time:.1f}s)")

            if not self.mcp_client.mcp_tools:
                logger.warning(f"no MCP tools loaded after {max_wait_time}s; continuing without tool bindings")
                self.configure_mcp(
                    mcp_client=self.mcp_client,
                    device_id=device_to_use,
                    server_name=server_name_filter,
                    tools=[],
                )
        else:
            logger.error("failed to connect MCP")

    async def message_to_device(self, message_type: str, payload: Any) -> bool:
        """Send message to device"""
        if not self.mcp_client or not self.device_id:
            return False

        topic = f"$message/{self.device_id}"
        message = json.dumps({
            "type": message_type,
            "payload": payload
        })

        return await self.mcp_client.publish_message(topic, message)

    async def stream_chat(self, user_input: str) -> AsyncGenerator[AgentResponse, None]:
        """Streaming conversation - parallel processing of voice responses and tool calls"""
        try:
            start_time = time.time()
            logger.info(f"processing user input: '{user_input}'")

            await self.message_to_device("message", {"type": "loading", "status": "processing"})

            # Parallel processing
            async for response in self._parallel_processing(user_input, start_time):
                yield response

            # Complete processing
            total_time = time.time() - start_time
            logger.info(f"response completed: {total_time:.3f}s")

            await self.message_to_device("message", {"type": "loading", "status": "complete"})
            yield AgentResponse(type=ResponseType.STREAM_END)

        except Exception as e:
            error_time = time.time()
            logger.error(f"error after {error_time - start_time:.3f}s: {e}")
            yield AgentResponse(
                type=ResponseType.ERROR,
                content=str(e)
            )

    async def _parallel_processing(self, user_input: str, start_time: float) -> AsyncGenerator[AgentResponse, None]:
        """Simplified parallel processing"""
        logger.debug("starting parallel processing")

        async with anyio.create_task_group() as tg:
            # Start tool calling task (background)
            async def tool_task():
                try:
                    result = await self.emotion_agent.determine_and_call_tools(user_input, "")
                    if result:
                        logger.debug(f"tool result: {result}")
                except Exception as e:
                    logger.error(f"tool error: {e}")

            # Start tool calling task
            tg.start_soon(tool_task)

            # Stream voice response with proper tool execution
            async for chunk in self.voice_agent.generate_response_stream(user_input):
                yield AgentResponse(
                    type=ResponseType.STREAM_CHUNK,
                    content=chunk
                )


    def clear_history(self):
        """Clear conversation history"""
        logger.info("clearing conversation history")
        self.voice_agent.clear_history()


    async def shutdown(self):
        """Shutdown agent and connections"""
        logger.info("shutting down")
        if self._owns_mcp_client and self.mcp_client:
            await self.mcp_client.stop()
        if self._owns_mcp_client and self.tg and self._tg_entered:
            await self.tg.__aexit__(None, None, None)
            self._tg_entered = False
            self.tg = None
        self._owns_mcp_client = False
