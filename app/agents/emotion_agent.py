import logging
from typing import Any, Dict, List, Optional, Sequence

from llama_index.llms.openai_like import OpenAILike
from llama_index.core.agent import FunctionAgent
from llama_index.core.tools import BaseTool

from mcp_client_init import McpMqttClient

from utils.prompt_loader import load_system_prompt

logger = logging.getLogger(__name__)


class EmotionAgent:
    """Agent specialized in emotion control - manages avatar facial expressions"""

    def __init__(
        self,
        *,
        temperature: float = 0.0,
        max_tokens: int = 1000,
        system_prompt_file: str = "prompts/emotion_system_prompt.txt",
        model: Optional[str] = None,
        api_key: Optional[str] = None,
        api_base: Optional[str] = None,
    ):
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.model = model
        self.api_key = api_key
        self.api_base = api_base

        # Load system prompt from file
        self.system_prompt = load_system_prompt(system_prompt_file)

        # MCP tools and emotion agent
        self.mcp_tools: List[BaseTool] = []
        self.mcp_client: Optional[McpMqttClient] = None
        self.agent: Optional[FunctionAgent] = None
        self._tool_signature: Optional[tuple[str, ...]] = None

        self.llm: Optional[OpenAILike] = self._build_llama_index_llm()

        if self.llm:
            logger.info("EmotionAgent LLM initialized")
        else:
            logger.error("EmotionAgent LLM initialization failed; agent will not be available until credentials are provided")

    def update_mcp_context(self, mcp_client: Optional[McpMqttClient], tools: Sequence[BaseTool]) -> None:
        """Attach MCP client and rebuild filtered tool set when changed."""

        tools_list = list(tools) if tools else []
        signature = tuple(
            tool.metadata.name if hasattr(tool, "metadata") and hasattr(tool.metadata, "name") else str(tool)
            for tool in tools_list
        )

        if self.mcp_client is mcp_client and self._tool_signature == signature:
            return

        self.mcp_client = mcp_client
        self.mcp_tools = tools_list
        self._tool_signature = signature

        if not tools_list:
            if self.agent is not None:
                logger.info("EmotionAgent cleared MCP bindings; tool agent disabled")
            self.agent = None
            return

        tool_names = [
            tool.metadata.name
            if hasattr(tool, "metadata") and hasattr(tool.metadata, "name")
            else str(tool)
            for tool in tools_list
        ]
        logger.info(
            "EmotionAgent received MCP tools (%s): %s",
            len(tool_names),
            ", ".join(tool_names) if tool_names else "[unknown]",
        )
        self._initialize_function_agent()

    def _initialize_function_agent(self):
        """Initialize FunctionAgent"""
        if not self.llm:
            logger.warning("LLM unavailable; cannot initialize EmotionAgent")
            return

        if not self.mcp_tools:
            logger.warning("No MCP tools available for EmotionAgent; skipping function agent initialization")
            self.agent = None
            return

        filtered_tools = []
        for tool in self.mcp_tools:
            tool_name = tool.metadata.name if hasattr(tool, "metadata") and hasattr(tool.metadata, "name") else str(tool)
            if tool_name == "change_emotion":
                filtered_tools.append(tool)
                logger.debug("EmotionAgent included tool: %s", tool_name)
            else:
                logger.debug("EmotionAgent skipped tool: %s", tool_name)

        if not filtered_tools:
            logger.warning("EmotionAgent found no emotion tools after filtering; initialization skipped")
            self.agent = None
            return

        try:
            self.agent = FunctionAgent(
                tools=filtered_tools,
                llm=self.llm,
                verbose=False,
                system_prompt=self.system_prompt,
                max_function_calls=2,
                timeout=8.0,
            )
            tool_names = [
                tool.metadata.name
                for tool in filtered_tools
                if hasattr(tool, "metadata") and hasattr(tool.metadata, "name")
            ]
            logger.info(
                "Emotion FunctionAgent initialized with %s tools: %s",
                len(tool_names),
                tool_names or "[unknown]",
            )
        except Exception as exc:
            logger.error("Failed to initialize Emotion FunctionAgent: %s", exc)
            self.agent = None

    async def determine_and_call_tools(self, user_input: str, context: str = "") -> Optional[Dict[str, Any]]:
        try:
            if not self.agent:
                logger.warning("Emotion FunctionAgent not initialized")
                return None

            logger.info("EmotionAgent processing user input")

            import asyncio
            try:
                response = await asyncio.wait_for(self.agent.run(user_input), timeout=8.0)
                logger.info("EmotionAgent completed: %s", response)

                return {
                    "tool_name": "function_agent",
                    "tool_args": {"user_input": user_input},
                    "tool_result": str(response)
                }
            except asyncio.TimeoutError:
                logger.error("EmotionAgent timeout after 8s")
                return None

        except Exception as e:
            logger.error("EmotionAgent error: %s", e)
            return None

    def _build_llama_index_llm(self) -> Optional[OpenAILike]:
        api_key = self.api_key or self._fallback_env("EMOTION_LLM_API_KEY") or self._fallback_env("DASHSCOPE_API_KEY")
        api_base = (
            self.api_base
            or self._fallback_env("EMOTION_LLM_API_BASE")
            or self._fallback_env("LLM_API_BASE")
            or "https://dashscope.aliyuncs.com/compatible-mode/v1"
        )
        model_name = self.model or self._fallback_env("EMOTION_LLM_MODEL") or self._fallback_env("LLM_MODEL") or "qwen-flash"

        if not api_key or not model_name:
            logger.error("Missing API credentials for EmotionAgent")
            return None

        try:
            return OpenAILike(
                model=model_name,
                api_key=api_key,
                api_base=api_base,
                is_chat_model=True,
                is_function_calling_model=True,
                temperature=self.temperature,
                max_tokens=self.max_tokens,
                timeout=30,
            )
        except Exception as exc:
            logger.error("Failed to create OpenAILike LLM for EmotionAgent: %s", exc)
            return None

    @staticmethod
    def _fallback_env(name: str) -> Optional[str]:
        import os

        value = os.getenv(name)
        return value.strip() if value else None
