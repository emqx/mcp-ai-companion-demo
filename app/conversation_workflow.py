import os
import time
import json
import anyio
from typing import Optional, AsyncGenerator, Dict, Any
from dataclasses import dataclass, replace
from enum import Enum

from mcp_client_init import McpMqttClient
from mcp.shared.mqtt import MqttOptions
from agents.emotion_agent import EmotionAgent
from agents.voice_agent import VoiceAgent
from llm import BaseLLMClient, create_llm_client
from utils.colored_logger import get_agent_logger
from utils.config import LLMSettings, get_llm_settings

logger = get_agent_logger("chat")


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
        llm_client: Optional[BaseLLMClient] = None,
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

        try:
            self.llm_client = llm_client or create_llm_client(self.llm_settings)
        except Exception as exc:
            raise ValueError(f"Failed to initialize LLM client: {exc}") from exc

        custom_options = self.llm_settings.custom_options
        history_length = custom_options.history_length if custom_options else self.llm_settings.history_length
        enable_round_id = custom_options.enable_round_id if custom_options else self.llm_settings.enable_round_id
        custom_payload = custom_options.custom_payload if custom_options else {}

        self.voice_agent = VoiceAgent(
            llm_client=self.llm_client,
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
        )

        emotion_api_key = os.getenv("EMOTION_LLM_API_KEY") or os.getenv("DASHSCOPE_API_KEY")
        if not emotion_api_key:
            raise ValueError("EmotionAgent requires EMOTION_LLM_API_KEY or DASHSCOPE_API_KEY")

        emotion_api_base = os.getenv("EMOTION_LLM_API_BASE") or "https://dashscope.aliyuncs.com/compatible-mode/v1"
        emotion_model = os.getenv("EMOTION_LLM_MODEL") or os.getenv("LLM_MODEL") or "qwen-flash"

        self.emotion_agent = EmotionAgent(
            api_key=emotion_api_key,
            api_base=emotion_api_base,
            model=emotion_model,
            system_prompt_file=tool_prompt_file,
            temperature=0.0,
            max_tokens=1000,
        )

        self.mcp_client: Optional[McpMqttClient] = None

        logger.info("initialized with provider=%s", self.llm_settings.provider)
        self.tg: anyio.abc.TaskGroup | None = None
        self._tg_entered = False

    def _reinit_agents(self):
        """Simple reinit function when MCP tools are updated"""
        logger.info("Reinitializing agents with updated MCP tools")

        # Set MCP client for emotion control agent
        self.emotion_agent.set_mcp_client(self.mcp_client)

        # Set MCP client for voice response agent
        self.voice_agent.set_mcp_client(self.mcp_client)

        logger.info("Agents reinitialized successfully")

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

        mqtt_clientid = os.getenv("MQTT_CLIENT_ID") or f"mcp_ai_companion_{os.getpid()}"

        self.mcp_client = McpMqttClient(
            mqtt_options=mqtt_options,
            client_name="ai_companion_demo",
            server_name_filter=server_name_filter,
            clientid=mqtt_clientid,
            device_id=device_to_use,
            on_tools_updated=self._reinit_agents
        )

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

            # Wait for tools to load
            max_wait_time = 10  # seconds
            wait_interval = 0.5  # seconds
            waited_time = 0

            while waited_time < max_wait_time:
                if self.mcp_client.mcp_tools:
                    logger.info(f"MCP tools loaded: {len(self.mcp_client.mcp_tools)} tools")

                    # Set MCP client for emotion control agent
                    self.emotion_agent.set_mcp_client(self.mcp_client)

                    # Set MCP client for voice response agent
                    self.voice_agent.set_mcp_client(self.mcp_client)
                    break

                await anyio.sleep(wait_interval)
                waited_time += wait_interval
                logger.debug(f"waiting for MCP tools... ({waited_time:.1f}s)")

            if not self.mcp_client.mcp_tools:
                logger.warning(f"no MCP tools loaded after {max_wait_time}s timeout")
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
        if self.mcp_client:
            await self.mcp_client.stop()
        if self.tg and self._tg_entered:
            await self.tg.__aexit__(None, None, None)
            self._tg_entered = False
            self.tg = None
