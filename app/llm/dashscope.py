from __future__ import annotations

from typing import AsyncGenerator, Dict, Optional

from openai import AsyncOpenAI

from .base import BaseLLMClient, ChatRequest, ChatResponse, StreamChunk, LLMException


class DashScopeLLMClient(BaseLLMClient):
    name = "dashscope"

    def __init__(
        self,
        *,
        api_key: str,
        api_base: str,
        model: str,
        timeout: float = 60.0,
    ):
        self.model = model
        self._client = AsyncOpenAI(api_key=api_key, base_url=api_base, timeout=timeout)

    async def stream_chat(self, request: ChatRequest) -> AsyncGenerator[StreamChunk, None]:
        if not self._client:
            raise LLMException("OpenAI-style client is not initialized")

        payload = self._build_payload(request)
        stream = await self._client.chat.completions.create(stream=True, **payload)

        async for event in stream:
            for choice in event.choices:
                delta = getattr(choice.delta, "content", None) or ""
                if delta:
                    yield StreamChunk(content=delta, raw=event.model_dump())
                if choice.finish_reason:
                    yield StreamChunk(content="", is_final=True, raw=event.model_dump())

    async def complete(self, request: ChatRequest) -> ChatResponse:
        if not self._client:
            raise LLMException("OpenAI-style client is not initialized")

        payload = self._build_payload(request)
        completion = await self._client.chat.completions.create(stream=False, **payload)
        message = completion.choices[0].message
        text = message.content or ""
        return ChatResponse(text=text, raw=completion.model_dump())

    def _build_payload(self, request: ChatRequest) -> Dict:
        payload: Dict[str, Optional[object]] = {
            "model": request.model or self.model,
            "messages": [message.to_dict() for message in request.messages],
            "temperature": request.temperature,
            "top_p": request.top_p,
            "max_tokens": request.max_tokens,
        }
        # Remove None values for compatibility
        return {key: value for key, value in payload.items() if value is not None}
