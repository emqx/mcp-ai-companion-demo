import os
import anyio
import logging
from typing import List, Optional, AsyncGenerator, Dict, Any
from pathlib import Path
from dataclasses import dataclass
from enum import Enum

from llama_index.core.agent import FunctionAgent
from llama_index.core.tools import BaseTool, FunctionTool
from llama_index.llms.openai_like import OpenAILike
from llama_index.core.memory import Memory

from mcp_client_init import McpMqttClient
from mcp.shared.mqtt import MqttOptions
from tools import explain_photo, explain_photo_async

logger = logging.getLogger(__name__)


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


class ConversationAgent:
    def __init__(
        self,
        api_key: str = None,
        api_base: str = "https://dashscope.aliyuncs.com/compatible-mode/v1",
        model: str = "deepseek-v3",
        system_prompt_file: str = "prompts/conversational_system_prompt.txt",
        temperature: float = 0.6,
        max_tokens: int = 60000,
        max_history_length: int = 20,
        device_id: Optional[str] = None
    ):
        # API Key
        self.api_key = api_key or api_key or os.environ.get("DASHSCOPE_API_KEY")
        if not self.api_key:
            raise ValueError("API key is required")

        # LLM initialization
        self.llm = OpenAILike(
            model=model,
            api_key=self.api_key,
            api_base=api_base,
            is_chat_model=True,
            is_function_calling_model=True,
            temperature=temperature,
            max_tokens=max_tokens,
            timeout=60,
        )

        self.system_prompt = self._load_system_prompt(system_prompt_file)

        self.tools: List[BaseTool] = []
        self.mcp_tools: List[BaseTool] = []
        self._init_base_tools()

        self.memory = Memory.from_defaults(
            token_limit=1000,  # Reduce context to avoid LlamaIndex scratchpad pollution
            session_id=f"session_{device_id or 'default'}"
        )

        # MCP related
        self.device_id = device_id
        self.mcp_client: Optional[McpMqttClient] = None

        # Agent instance
        self.agent: Optional[FunctionAgent] = None
        self._initialize_agent()

    def _load_system_prompt(self, prompt_file: str) -> str:
        """Load system prompt"""
        prompt_path = Path(__file__).parent / prompt_file
        if prompt_path.exists():
            with open(prompt_path, "r", encoding="utf-8") as f:
                return f.read().strip()
        logger.warning(f"System prompt file not found: {prompt_path}")
        return "You are an intelligent assistant."

    def _init_base_tools(self):
        """Initialize base tools"""
        photo_tool = FunctionTool.from_defaults(
            fn=explain_photo,
            name="explain_photo",
            description=(
                "Analyze and explain a photo based on a specific question. "
                "Required parameters: image_url (string) - the URL of the image to analyze, "
                "question (string) - the specific question about the image. "
                "Returns: A text description answering the question about the image."
            ),
            async_fn=explain_photo_async,
        )
        self.tools.append(photo_tool)

    def _initialize_agent(self):
        """Initialize agent"""
        all_tools = self.tools + self.mcp_tools

        # Configure FunctionAgent according to best practices
        self.agent = FunctionAgent(
            tools=all_tools,
            llm=self.llm,
            system_prompt=self.system_prompt,
            verbose=False,
            streaming=True,
            timeout=30.0,
        )

        logger.info(f"Agent initialized with {len(all_tools)} tools")

    async def init_mcp(
        self,
        tg: anyio.abc.TaskGroup,
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
            device_id=device_to_use
        )

        # Start MCP
        tg.start_soon(self.mcp_client.start)

        # Wait for connection
        connected = await self.mcp_client.connect()
        if connected:
            logger.info(f"MCP connected with device_id: {device_to_use}")
            self.device_id = device_to_use

            # Update MCP tools
            if self.mcp_client.mcp_tools:
                self.mcp_tools = self.mcp_client.mcp_tools
                self._initialize_agent()
        else:
            logger.error("Failed to connect MCP")

    async def message_to_device(self, message_type: str, payload: any) -> bool:
        """Send message to device"""
        if not self.mcp_client or not self.device_id:
            return False

        import json
        topic = f"$message/{self.device_id}"
        message = json.dumps({
            "type": message_type,
            "payload": payload
        })

        return await self.mcp_client.publish_message(topic, message)

    async def stream_chat(self, user_input: str) -> AsyncGenerator[AgentResponse, None]:
        try:
            # Recreate LLM instance for each conversation
            self.llm = OpenAILike(
                model="deepseek-v3",
                api_key=self.api_key,
                api_base="https://dashscope.aliyuncs.com/compatible-mode/v1",
                is_chat_model=True,
                is_function_calling_model=True,
                temperature=0.6,
                max_tokens=60000,
                timeout=60,
            )
            
            # Reinitialize Agent
            self._initialize_agent()
            
            await self.message_to_device("message", {"type": "loading", "status": "processing"})

            accumulated = ""
            first_chunk = False

            handler = self.agent.run(
                user_msg=user_input,
                memory=self.memory
            )

            # Streaming output
            async for event in handler.stream_events():
                # Extract content from event
                token = None
                if hasattr(event, 'delta') and event.delta:
                    token = event.delta
                elif hasattr(event, 'chunk') and event.chunk:
                    token = event.chunk

                if token:
                    # Update status on first chunk
                    if not first_chunk:
                        await self.message_to_device("message", {"type": "loading", "status": "waiting"})
                        first_chunk = True

                    accumulated += token
                    yield AgentResponse(
                        type=ResponseType.STREAM_CHUNK,
                        content=token
                    )

            # End of stream
            await self.message_to_device("message", {"type": "loading", "status": "complete"})
            yield AgentResponse(type=ResponseType.STREAM_END)

        except Exception as e:
            logger.error(f"Stream chat error: {e}")
            yield AgentResponse(
                type=ResponseType.ERROR,
                content=str(e)
            )

    def clear_history(self):
        """Clear history"""
        self.memory.reset()

    async def shutdown(self):
        """Shutdown"""
        if self.mcp_client:
            await self.mcp_client.stop()
