from __future__ import annotations

import logging
from typing import AsyncGenerator, List, Optional, Sequence

from llama_index.llms.openai_like import OpenAILike
from llama_index.core.agent import (
    FunctionAgent,
    AgentStream,
    AgentOutput,
    ToolCall,
    ToolCallResult,
)
from llama_index.core.tools import BaseTool
from llama_index.core.llms import ChatMessage

from workflows.events import StopEvent
from utils.prompt_loader import load_system_prompt

from mcp_client_init import McpMqttClient

logger = logging.getLogger(__name__)


class VoiceAgent:
    """Voice response agent powered by a generic LLM client"""

    def __init__(
        self,
        *,
        temperature: float = 0.6,
        top_p: float = 1.0,
        max_tokens: int = 5000,
        history_length: int = 5,
        system_prompt_file: str = "prompts/voice_reply_system_prompt.txt",
        system_messages: Optional[List[str]] = None,
        user_prompts: Optional[List[dict]] = None,
        enable_round_id: bool = False,
        custom_payload: Optional[dict] = None,
        device_id: Optional[str] = None,
        model: Optional[str] = None,
        api_key: Optional[str] = None,
        api_base: Optional[str] = None,
    ):
        self.temperature = temperature
        self.top_p = top_p
        self.max_tokens = max_tokens
        self.history_length = history_length
        self.enable_round_id = enable_round_id
        self.custom_payload = custom_payload or {}
        self.device_id = device_id
        self.model = model
        self.api_key = api_key
        self.api_base = api_base

        self.system_prompt = load_system_prompt(system_prompt_file)
        self.extra_system_messages = system_messages or []
        self.user_prompts = user_prompts or []
        self.base_messages: List[ChatMessage] = [ChatMessage(role="system", content=self.system_prompt)]

        if self.extra_system_messages:
            for message in self.extra_system_messages:
                self.base_messages.append(ChatMessage(role="system", content=message))

        if self.user_prompts:
            for prompt in self.user_prompts:
                role = prompt.get("Role") or prompt.get("role")
                content = prompt.get("Content") or prompt.get("content")
                if role and content:
                    self.base_messages.append(ChatMessage(role=role, content=content))

        self.history: List[ChatMessage] = []

        self.mcp_client: Optional[McpMqttClient] = None
        self.mcp_tools = []
        self.function_agent: Optional[FunctionAgent] = None
        self._direct_llm: Optional[OpenAILike] = None
        self._tool_signature: Optional[tuple[str, ...]] = None

        logger.info(
            "VoiceAgent initialized: history_length=%s, base_messages=%s",
            self.history_length,
            len(self.base_messages),
        )

    def update_mcp_context(self, mcp_client: Optional[McpMqttClient], tools: Sequence[BaseTool]) -> None:
        """Attach MCP client and tools; rebuild function agent when bindings change."""

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

        tool_names = [
            tool.metadata.name
            if hasattr(tool, "metadata") and hasattr(tool.metadata, "name")
            else str(tool)
            for tool in tools_list
        ]
        logger.info(
            "VoiceAgent received MCP tools (%s): %s",
            len(tool_names),
            ", ".join(tool_names) if tool_names else "[unknown]",
        )
        self._initialize_function_agent()

    def _initialize_function_agent(self):
        llm = self._build_llama_index_llm()
        if llm is None:
            self.function_agent = None
            return
        self._direct_llm = llm

        system_prompt = self._compose_system_prompt()

        try:
            self.function_agent = FunctionAgent(
                tools=self.mcp_tools,
                llm=llm,
                verbose=False,
                system_prompt=system_prompt,
                max_function_calls=4,
                timeout=15.0,
            )
            tool_names = [
                tool.metadata.name
                for tool in self.mcp_tools
                if hasattr(tool, "metadata") and hasattr(tool.metadata, "name")
            ]
            if tool_names:
                logger.info(
                    "Voice FunctionAgent initialized with %s tools: %s",
                    len(tool_names),
                    tool_names,
                )
            else:
                logger.info("Voice FunctionAgent initialized without MCP tools; using base LLM only")
        except Exception as exc:
            logger.error("Failed to initialize Voice FunctionAgent: %s", exc)
            self.function_agent = None

    def _build_llama_index_llm(self) -> Optional[OpenAILike]:
        api_key = self.api_key or self._fallback_env("LLM_API_KEY") or self._fallback_env("DASHSCOPE_API_KEY")
        api_base = self.api_base or self._fallback_env("LLM_API_BASE") or "https://dashscope.aliyuncs.com/compatible-mode/v1"
        model_name = self.model or self._fallback_env("LLM_MODEL") or "qwen-flash"

        if not api_key or not model_name:
            logger.error("Missing API credentials for Voice FunctionAgent")
            return None

        try:
            return OpenAILike(
                model=model_name,
                api_key=api_key,
                api_base=api_base,
                temperature=self.temperature,
                max_tokens=self.max_tokens,
                is_chat_model=True,
                is_function_calling_model=True,
                timeout=60,
            )
        except Exception as exc:
            logger.error("Failed to create OpenAILike LLM for VoiceAgent: %s", exc)
            return None

    def _ensure_direct_llm(self) -> Optional[OpenAILike]:
        if self._direct_llm is None:
            self._direct_llm = self._build_llama_index_llm()
        return self._direct_llm

    @staticmethod
    def _fallback_env(name: str) -> Optional[str]:
        import os
        value = os.getenv(name)
        return value.strip() if value else None

    def _compose_system_prompt(self) -> str:
        sections = [self.system_prompt]
        if self.extra_system_messages:
            sections.extend(self.extra_system_messages)
        if self.user_prompts:
            formatted = []
            for prompt in self.user_prompts:
                role = prompt.get("Role") or prompt.get("role") or "user"
                content = prompt.get("Content") or prompt.get("content")
                if content:
                    formatted.append(f"{role}: {content}")
            if formatted:
                sections.append("\n".join(formatted))
        return "\n\n".join(section for section in sections if section)

    def clear_history(self):
        logger.info("Conversation history cleared")
        self.history.clear()

    async def generate_response_stream(self, user_input: str) -> AsyncGenerator[str, None]:
        if not self.function_agent:
            logger.warning("FunctionAgent unavailable for VoiceAgent; no MCP tools bound")
            logger.error("Voice FunctionAgent unavailable; aborting request")
            raise RuntimeError("Voice FunctionAgent unavailable")

        user_message = ChatMessage(role="user", content=user_input)
        self.history.append(user_message)

        logger.info("Start generating response with FunctionAgent")
        context_prompt = self._build_context_prompt()
        query = user_input if not context_prompt else f"{context_prompt}\nUser: {user_input}"

        assistant_chunks: List[str] = []

        try:
            handler = self.function_agent.run(
                user_msg=user_message,
                chat_history=self.history[:-1],
            )

            async for event in handler.stream_events():
                if isinstance(event, AgentStream):
                    accumulated = "".join(assistant_chunks)
                    delta = event.delta or ""
                    if not delta and event.response:
                        if len(event.response) > len(accumulated):
                            delta = event.response[len(accumulated):]
                    if delta:
                        assistant_chunks.append(delta)
                        yield delta
                elif isinstance(event, ToolCall):
                    logger.info("VoiceAgent tool call: %s(%s)", event.tool_name, event.tool_kwargs)
                elif isinstance(event, ToolCallResult):
                    logger.info("VoiceAgent tool result: %s -> %s", event.tool_name, event.tool_output.content)
                elif isinstance(event, AgentOutput):
                    content = event.response.content or ""
                    if content:
                        accumulated = "".join(assistant_chunks)
                        if len(content) > len(accumulated):
                            delta = content[len(accumulated):]
                            if delta:
                                assistant_chunks.append(delta)
                                yield delta

            stop_event = await handler
            if isinstance(stop_event, StopEvent):
                result = stop_event.result
                if isinstance(result, AgentOutput):
                    content = result.response.content or ""
                    accumulated = "".join(assistant_chunks)
                    if content and len(content) > len(accumulated):
                        assistant_chunks.append(content[len(accumulated):])
            else:
                logger.debug("VoiceAgent handler returned: %s", stop_event)

        except Exception as exc:
            if self.history and self.history[-1] is user_message:
                self.history.pop()
            logger.error("Voice FunctionAgent streaming failed: %s", exc)
            raise

        assistant_text = "".join(assistant_chunks).strip()
        self.history.append(ChatMessage(role="assistant", content=assistant_text))
        logger.info("assistant reply: %s", assistant_text)

        if self.history_length > 0:
            retain = self.history_length * 2
            if len(self.history) > retain:
                self.history = self.history[-retain:]

        logger.info("Response generation finished, length=%s", len(assistant_text))

    async def _chunk_text(self, text: str) -> AsyncGenerator[str, None]:
        for char in text:
            yield char

    def _build_context_prompt(self) -> str:
        if not self.history:
            return ""
        relevant_history = self.history[-self.history_length * 2 :] if self.history_length > 0 else self.history
        lines = []
        for message in relevant_history:
            prefix = "Assistant" if message.role == "assistant" else "User"
            lines.append(f"{prefix}: {message.content}")
        return "\n".join(lines)
