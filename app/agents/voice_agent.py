from __future__ import annotations

import time
from typing import AsyncGenerator, List, Optional, Sequence

from llama_index.llms.openai_like import OpenAILike
from llama_index.core.agent import FunctionAgent
from llama_index.core.tools import BaseTool, FunctionTool
from llama_index.core.memory import Memory

from utils.prompt_loader import load_system_prompt
from utils.colored_logger import get_agent_logger

from tools import explain_photo, explain_photo_async
from mcp_client_init import McpMqttClient

logger = get_agent_logger("voice")


class VoiceAgent:
    """Voice agent that streams responses and uses FunctionAgent tool calling."""

    def __init__(
        self,
        *,
        api_key: Optional[str] = None,
        api_base: Optional[str] = None,
        model: Optional[str] = None,
        temperature: float = 0.6,
        top_p: float = 1.0,
        max_tokens: int = 5000,
        system_prompt_file: str = "prompts/voice_reply_system_prompt.txt",
        device_id: Optional[str] = None,
        custom_payload: Optional[dict] = None,
        **_: object,
    ) -> None:
        resolved_api_key = api_key or self._fallback_env("LLM_API_KEY") or self._fallback_env("DASHSCOPE_API_KEY")
        resolved_api_base = api_base or self._fallback_env("LLM_API_BASE") or "https://dashscope.aliyuncs.com/compatible-mode/v1"
        resolved_model = model or self._fallback_env("LLM_MODEL") or "qwen-flash"

        if not resolved_api_key or not resolved_model:
            raise RuntimeError("VoiceAgent missing LLM credentials")

        self.temperature = temperature
        self.top_p = top_p
        self.max_tokens = max_tokens
        self.model = resolved_model
        self.custom_payload = dict(custom_payload or {})
        self.device_id = device_id

        self.llm = OpenAILike(
            model=resolved_model,
            api_key=resolved_api_key,
            api_base=resolved_api_base,
            is_chat_model=True,
            is_function_calling_model=True,
            temperature=temperature,
            max_tokens=max_tokens,
            timeout=60,
        )

        self.system_prompt = load_system_prompt(system_prompt_file)

        self.tools: List[BaseTool] = []
        self.mcp_tools: List[BaseTool] = []
        self.mcp_client: Optional[McpMqttClient] = None
        self._init_base_tools()

        self.memory = Memory.from_defaults(
            token_limit=1000,
            session_id=f"session_{device_id or 'voice'}",
        )

        self.agent: Optional[FunctionAgent] = None
        self._initialize_agent()

    @staticmethod
    def _fallback_env(name: str) -> Optional[str]:
        import os

        value = os.getenv(name)
        return value.strip() if value else None

    def _init_base_tools(self) -> None:
        """Configure default explain_photo tool."""

        photo_tool = FunctionTool.from_defaults(
            fn=explain_photo,
            name="explain_photo",
            description=(
                "Analyze and explain an image located at image_url. "
                "Required params: image_url (str) and question (str). Returns a textual answer."
            ),
            async_fn=explain_photo_async,
        )
        self.tools.append(photo_tool)

    def _initialize_agent(self) -> None:
        """Create FunctionAgent with current tool set."""

        filtered_tools: List[BaseTool] = []
        for tool in self.mcp_tools:
            tool_name = getattr(getattr(tool, "metadata", None), "name", str(tool))
            if tool_name == "change_emotion":
                logger.debug("VoiceAgent filtered tool: %s", tool_name)
                continue
            filtered_tools.append(tool)
            logger.debug("VoiceAgent allowed tool: %s", tool_name)

        all_tools = self.tools + filtered_tools

        try:
            self.agent = FunctionAgent(
                tools=all_tools,
                llm=self.llm,
                system_prompt=self.system_prompt,
                verbose=False,
                streaming=True,
                timeout=20.0,
                max_function_calls=5,
            )
            logger.info(
                "VoiceAgent initialized with %s tools: %s",
                len(all_tools),
                [getattr(getattr(t, "metadata", None), "name", str(t)) for t in all_tools],
            )
        except Exception as exc:
            logger.error("Failed to initialize Voice FunctionAgent: %s", exc)
            self.agent = None

    def update_mcp_context(
        self,
        mcp_client: Optional[McpMqttClient],
        tools: Sequence[BaseTool],
    ) -> None:
        """Compatibility shim for ConversationWorkflow."""

        self.set_mcp_client(mcp_client)
        if tools:
            self.set_mcp_tools(list(tools))
        elif mcp_client and mcp_client.mcp_tools:
            self.set_mcp_tools(mcp_client.mcp_tools)
        else:
            self.mcp_tools = []
            self._initialize_agent()

    def set_mcp_tools(self, mcp_tools: List[BaseTool]) -> None:
        self.mcp_tools = mcp_tools or []
        self._initialize_agent()

    def set_mcp_client(self, mcp_client: Optional[McpMqttClient]) -> None:
        self.mcp_client = mcp_client
        if mcp_client and mcp_client.mcp_tools:
            self.set_mcp_tools(mcp_client.mcp_tools)

    async def generate_response_stream(self, user_input: str) -> AsyncGenerator[str, None]:
        """Stream response tokens from FunctionAgent."""

        try:
            start_time = time.time()

            if not self.agent:
                logger.error("VoiceAgent not initialized")
                yield "抱歉，我现在有点忙，稍后再试试吧。"
                return

            accumulated = ""
            first_token_time: Optional[float] = None

            handler = self.agent.run(user_msg=user_input, memory=self.memory)

            async for event in handler.stream_events():
                token = getattr(event, "delta", None) or getattr(event, "chunk", None)
                if not token:
                    continue

                if first_token_time is None:
                    first_token_time = time.time()
                    logger.info("first token latency: %.3fs", first_token_time - start_time)

                accumulated += token
                yield token

            logger.info("VoiceAgent response complete: %.3fs, %s chars", time.time() - start_time, len(accumulated))

        except Exception as exc:
            logger.error("VoiceAgent generation error: %s", exc)
            yield f"抱歉，我这边出错了：{exc}"

    def clear_history(self) -> None:
        logger.info("VoiceAgent conversation history cleared")
        self.memory.reset()
