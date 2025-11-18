from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence

from llama_index.llms.openai_like import OpenAILike
from llama_index.core.agent import FunctionAgent
from llama_index.core.tools import BaseTool

from mcp_client_init import McpMqttClient
from utils.colored_logger import get_agent_logger
from utils.prompt_loader import load_system_prompt

logger = get_agent_logger("emotion")


class EmotionAgent:
    """Agent specialized in emotion control - only calls change_emotion via MCP."""

    def __init__(
        self,
        *,
        api_key: Optional[str],
        api_base: Optional[str],
        model: Optional[str],
        temperature: float = 0.0,
        max_tokens: int = 1000,
        system_prompt_file: str = "prompts/emotion_system_prompt.txt",
    ) -> None:
        if not api_key or not model:
            raise RuntimeError("EmotionAgent missing LLM credentials")

        self.llm = OpenAILike(
            model=model,
            api_key=api_key,
            api_base=api_base,
            is_chat_model=True,
            is_function_calling_model=True,
            temperature=temperature,
            max_tokens=max_tokens,
            timeout=30,
        )

        self.system_prompt = load_system_prompt(system_prompt_file)
        self.mcp_tools: List[BaseTool] = []
        self.mcp_client: Optional[McpMqttClient] = None
        self.agent: Optional[FunctionAgent] = None
        self._tool_signature: Optional[tuple[str, ...]] = None

    def update_mcp_context(self, mcp_client: Optional[McpMqttClient], tools: Sequence[BaseTool]) -> None:
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
            logger.info("EmotionAgent cleared MCP tools; agent disabled")
            self.agent = None
            return

        self._initialize_agent()

    def set_mcp_client(self, mcp_client: Optional[McpMqttClient]) -> None:
        self.mcp_client = mcp_client
        if mcp_client and mcp_client.mcp_tools:
            self.set_mcp_tools(mcp_client.mcp_tools)

    def set_mcp_tools(self, mcp_tools: List[BaseTool]) -> None:
        self.mcp_tools = mcp_tools or []
        self._initialize_agent()

    def _initialize_agent(self) -> None:
        if not self.mcp_tools:
            logger.info("EmotionAgent has no tools; skipping initialization")
            self.agent = None
            return

        filtered_tools: List[BaseTool] = []
        for tool in self.mcp_tools:
            tool_name = tool.metadata.name if hasattr(tool, "metadata") and hasattr(tool.metadata, "name") else str(tool)
            logger.debug("checking tool: %s", tool_name)
            if tool_name == "change_emotion":
                filtered_tools.append(tool)
                logger.debug("included emotion tool: %s", tool_name)
            else:
                logger.debug("skipped tool: %s", tool_name)

        if not filtered_tools:
            logger.info("EmotionAgent found no change_emotion tool; agent disabled")
            self.agent = None
            return

        self.agent = FunctionAgent(
            tools=filtered_tools,
            llm=self.llm,
            verbose=False,
            system_prompt=self.system_prompt,
            max_function_calls=2,
            timeout=8.0,
        )
        logger.info("initialized with %s tools", len(filtered_tools))

    async def determine_and_call_tools(self, user_input: str, context: str = "") -> Optional[Dict[str, Any]]:
        try:
            if not self.agent:
                logger.warning("not initialized")
                return None

            logger.info("processing emotion input")

            import asyncio

            try:
                response = await asyncio.wait_for(self.agent.run(user_input), timeout=8.0)
                logger.info("emotion tool invocation completed")

                return {
                    "tool_name": "function_agent",
                    "tool_args": {"user_input": user_input},
                    "tool_result": str(response)
                }
            except asyncio.TimeoutError:
                logger.error("timeout after 8s")
                return None

        except Exception as e:
            logger.error("error: %s", e)
            return None
