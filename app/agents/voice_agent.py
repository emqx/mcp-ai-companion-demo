import time
from typing import List, AsyncGenerator, Optional

from llama_index.llms.openai_like import OpenAILike
from llama_index.core.agent import FunctionAgent
from llama_index.core.tools import BaseTool, FunctionTool
from llama_index.core.memory import Memory

from tools import explain_photo, explain_photo_async

from utils.prompt_loader import load_system_prompt
from utils.colored_logger import get_agent_logger

from mcp_client_init import McpMqttClient

logger = get_agent_logger("voice")


class VoiceAgent:
    """Voice agent with FunctionAgent - supports tool calling and streaming text generation"""

    def __init__(
        self,
        api_key: str,
        api_base: str,
        model: str,
        temperature: float = 0.6,
        max_tokens: int = 5000,
        system_prompt_file: str = "prompts/voice_reply_system_prompt.txt",
        device_id: Optional[str] = None,
    ):
        self.api_key = api_key

        # LLM initialization for conversation
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

        self.system_prompt = load_system_prompt(system_prompt_file)

        # Tools and agent
        self.tools: List[BaseTool] = []
        self.mcp_tools: List[BaseTool] = []
        self.mcp_client: Optional[McpMqttClient] = None
        self._init_base_tools()

        self.memory = Memory.from_defaults(
            token_limit=1000,
            session_id=f"session_{device_id or 'voice'}"
        )

        # Agent instance
        self.agent: Optional[FunctionAgent] = None
        self._initialize_agent()

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
        # Filter out change_emotion tool, other tools can be used
        filtered_mcp_tools = []

        for tool in self.mcp_tools:
            tool_name = tool.metadata.name if hasattr(tool, 'metadata') and hasattr(tool.metadata, 'name') else str(tool)
            logger.debug(f"checking tool: {tool_name}")
            if tool_name != "change_emotion":
                filtered_mcp_tools.append(tool)
                logger.debug(f"included tool: {tool_name}")
            else:
                logger.debug(f"filtered out tool: {tool_name}")

        all_tools = self.tools + filtered_mcp_tools

        self.agent = FunctionAgent(
            tools=all_tools,
            llm=self.llm,
            system_prompt=self.system_prompt,
            verbose=True,
            streaming=True,
            timeout=20.0,
            max_function_calls=5,
        )

        logger.info(f"initialized with {len(all_tools)} tools: {[tool.metadata.name if hasattr(tool, 'metadata') else str(tool) for tool in all_tools]}")

    def set_mcp_tools(self, mcp_tools: List[BaseTool]):
        """Set MCP tools"""
        self.mcp_tools = mcp_tools
        self._initialize_agent()

    def set_mcp_client(self, mcp_client: McpMqttClient):
        """Set MCP client"""
        self.mcp_client = mcp_client
        if mcp_client and mcp_client.mcp_tools:
            self.mcp_tools = mcp_client.mcp_tools
            self._initialize_agent()

    async def generate_response_stream(self, user_input: str) -> AsyncGenerator[str, None]:
        """Generate streaming response - using FunctionAgent"""
        try:
            start_time = time.time()

            if not self.agent:
                logger.error("Voice agent not initialized")
                yield "Sorry, voice agent not initialized."
                return

            accumulated_content = ""
            first_token_time = None

            handler = self.agent.run(user_msg=user_input, memory=self.memory)

            async for event in handler.stream_events():
                # Extract content
                token = None
                if hasattr(event, 'delta') and event.delta:
                    token = event.delta
                elif hasattr(event, 'chunk') and event.chunk:
                    token = event.chunk

                if token:
                    # Record first token time
                    if first_token_time is None:
                        first_token_time = time.time()
                        time_to_first_token = first_token_time - start_time
                        logger.info(f"first token: {time_to_first_token:.3f}s")

                    accumulated_content += token
                    yield token

            stream_end = time.time()
            total_time = stream_end - start_time

            logger.info(f"response complete: {total_time:.3f}s, {len(accumulated_content)} chars")

        except Exception as e:
            logger.error(f"error in response generation: {e}")
            yield f"Sorry, I encountered some issues: {str(e)}"


    def clear_history(self):
        """Clear conversation history"""
        logger.info("history cleared")
        self.memory.reset()
