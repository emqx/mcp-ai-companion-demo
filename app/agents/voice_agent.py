from __future__ import annotations

import logging
from typing import AsyncGenerator, List, Optional

from llm import BaseLLMClient, ChatMessage, ChatRequest, StreamChunk, create_round_id
from utils.prompt_loader import load_system_prompt

from mcp_client_init import McpMqttClient

logger = logging.getLogger(__name__)


class VoiceAgent:
    """Voice response agent powered by a generic LLM client"""

    def __init__(
        self,
        *,
        llm_client: BaseLLMClient,
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
    ):
        self.llm_client = llm_client
        self.temperature = temperature
        self.top_p = top_p
        self.max_tokens = max_tokens
        self.history_length = history_length
        self.enable_round_id = enable_round_id
        self.custom_payload = custom_payload or {}
        self.device_id = device_id
        self.model = model

        self.system_prompt = load_system_prompt(system_prompt_file)
        self.base_messages: List[ChatMessage] = [ChatMessage(role="system", content=self.system_prompt)]

        if system_messages:
            for message in system_messages:
                self.base_messages.append(ChatMessage(role="system", content=message))

        if user_prompts:
            for prompt in user_prompts:
                role = prompt.get("Role") or prompt.get("role")
                content = prompt.get("Content") or prompt.get("content")
                if role and content:
                    self.base_messages.append(ChatMessage(role=role, content=content))

        self.history: List[ChatMessage] = []

        self.mcp_client: Optional[McpMqttClient] = None
        self.mcp_tools = []

        logger.info(
            "VoiceAgent initialized: history_length=%s, base_messages=%s",
            self.history_length,
            len(self.base_messages),
        )

    def set_mcp_client(self, mcp_client: McpMqttClient):
        self.mcp_client = mcp_client
        if mcp_client:
            self.mcp_tools = getattr(mcp_client, "mcp_tools", [])

    def clear_history(self):
        logger.info("Conversation history cleared")
        self.history.clear()

    def _build_messages(self) -> List[ChatMessage]:
        if self.history_length <= 0:
            conversation = self.history
        else:
            retain = self.history_length * 2
            conversation = self.history[-retain:]

        return self.base_messages + conversation

    async def generate_response_stream(self, user_input: str) -> AsyncGenerator[str, None]:
        user_message = ChatMessage(role="user", content=user_input)
        self.history.append(user_message)

        accumulated = []
        round_id = create_round_id() if self.enable_round_id else None

        request = ChatRequest(
            messages=self._build_messages(),
            model=self.model,
            temperature=self.temperature,
            top_p=self.top_p,
            max_tokens=self.max_tokens,
            stream=True,
            custom_payload=self.custom_payload,
            round_id=round_id,
        )

        logger.info("Start generating response, round_id=%s", round_id)

        try:
            async for chunk in self.llm_client.stream_chat(request):
                if isinstance(chunk, StreamChunk):
                    if chunk.content:
                        accumulated.append(chunk.content)
                        yield chunk.content
                    if chunk.is_final:
                        break
                else:
                    token = str(chunk)
                    accumulated.append(token)
                    yield token

            assistant_text = "".join(accumulated)
            self.history.append(ChatMessage(role="assistant", content=assistant_text))
            if self.history_length > 0:
                retain = self.history_length * 2
                if len(self.history) > retain:
                    self.history = self.history[-retain:]
            logger.info("Response generation finished, length=%s", len(assistant_text))
        except Exception as exc:
            # Rollback user input when streaming fails
            if self.history and self.history[-1] is user_message:
                self.history.pop()
            logger.error("Failed to generate response: %s", exc)
            raise
