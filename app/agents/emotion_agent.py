from typing import List, Optional, Dict, Any

from llama_index.llms.openai_like import OpenAILike
from llama_index.core.agent import FunctionAgent

from mcp_client_init import McpMqttClient

from utils.prompt_loader import load_system_prompt
from utils.colored_logger import get_agent_logger

logger = get_agent_logger("emotion")


class EmotionAgent:
    """Agent specialized in emotion control - manages avatar facial expressions"""

    def __init__(
        self,
        api_key: str,
        api_base: str,
        model: str,
        temperature: float = 0.0,
        max_tokens: int = 1000,
        system_prompt_file: str = "prompts/emotion_system_prompt.txt",
    ):
        self.api_key = api_key

        # LLM initialization for emotion control
        self.llm = OpenAILike(
            model=model,
            api_key=self.api_key,
            api_base=api_base,
            is_chat_model=True,
            is_function_calling_model=True,
            temperature=temperature,
            max_tokens=max_tokens,
            timeout=30,
        )

        # Load system prompt from file
        self.system_prompt = load_system_prompt(system_prompt_file)

        # MCP tools and emotion agent
        self.mcp_tools: List = []
        self.mcp_client: Optional[McpMqttClient] = None
        self.agent: Optional[FunctionAgent] = None


    def set_mcp_client(self, mcp_client: McpMqttClient):
        """Set MCP client"""
        self.mcp_client = mcp_client
        if mcp_client and mcp_client.mcp_tools:
            self.mcp_tools = mcp_client.mcp_tools
            self._initialize_agent()

    def _initialize_agent(self):
        """Initialize FunctionAgent"""
        if self.mcp_tools:
            filtered_tools = []
            for tool in self.mcp_tools:
                tool_name = tool.metadata.name if hasattr(tool, 'metadata') and hasattr(tool.metadata, 'name') else str(tool)
                logger.debug(f"checking tool: {tool_name}")
                if tool_name == "change_emotion":
                    filtered_tools.append(tool)
                    logger.debug(f"included emotion tool: {tool_name}")
                else:
                    logger.debug(f"skipped tool: {tool_name}")

            self.agent = FunctionAgent(
                tools=filtered_tools,
                llm=self.llm,
                verbose=False,
                system_prompt=self.system_prompt,
                max_function_calls=2,
                timeout=8.0,
            )

            logger.info(f"initialized with {len(filtered_tools)} tools")

    async def determine_and_call_tools(self, user_input: str, context: str = "") -> Optional[Dict[str, Any]]:
        try:
            if not self.agent:
                logger.warning("not initialized")
                return None

            logger.info("processing user input...")

            import asyncio
            try:
                response = await asyncio.wait_for(self.agent.run(user_input), timeout=8.0)
                logger.info(f"completed: {response}")

                return {
                    "tool_name": "function_agent",
                    "tool_args": {"user_input": user_input},
                    "tool_result": str(response)
                }
            except asyncio.TimeoutError:
                logger.error("timeout after 8s")
                return None

        except Exception as e:
            logger.error(f"error: {e}")
            return None
