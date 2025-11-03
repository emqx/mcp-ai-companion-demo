from __future__ import annotations

import asyncio
import json
from typing import AsyncGenerator, Dict, Optional

import httpx

from .base import BaseLLMClient, ChatRequest, ChatResponse, StreamChunk, LLMException


class CustomLLMClient(BaseLLMClient):
    name = "custom"

    def __init__(
        self,
        *,
        url: str,
        model: str,
        api_key: Optional[str] = None,
        extra_headers: Optional[Dict[str, str]] = None,
        timeout: float = 30.0,
        max_retries: int = 2,
        client_factory=httpx.AsyncClient,
    ):
        self.url = url
        self.model = model
        self.api_key = api_key
        self.extra_headers = extra_headers or {}
        self.timeout = timeout
        self.max_retries = max_retries
        self.client_factory = client_factory

    async def stream_chat(self, request: ChatRequest) -> AsyncGenerator[StreamChunk, None]:
        payload = self._build_payload(request)
        headers = self._build_headers(request.extra_headers)

        attempt = 0
        delay = 0.5
        while True:
            try:
                async with self.client_factory(timeout=self.timeout, headers=headers) as client:
                    async with client.stream("POST", self.url, json=payload) as response:
                        if response.status_code != 200:
                            text = await response.aread()
                            raise LLMException(
                                f"Custom LLM request failed with status {response.status_code}, response: {text.decode('utf-8', errors='ignore')}"
                            )

                        async for chunk in self._iter_sse(response):
                            yield chunk
                break
            except Exception as exc:
                attempt += 1
                if attempt > self.max_retries:
                    raise LLMException(f"Custom LLM request failed after retries: {exc}") from exc
                await asyncio.sleep(delay * attempt)

    async def complete(self, request: ChatRequest) -> ChatResponse:
        buffer: list[str] = []
        override = {**request.__dict__, "stream": True}
        async for chunk in self.stream_chat(ChatRequest(**override)):
            if chunk.content:
                buffer.append(chunk.content)
        return ChatResponse(text="".join(buffer))

    async def _iter_sse(self, response: httpx.Response) -> AsyncGenerator[StreamChunk, None]:
        async for line in response.aiter_lines():
            if not line:
                continue
            if line.startswith(":"):
                continue
            if not line.startswith("data:"):
                continue

            data = line[5:].strip()
            if not data:
                continue

            if data == "[DONE]":
                yield StreamChunk(content="", is_final=True)
                break

            try:
                payload = json.loads(data)
            except json.JSONDecodeError:
                continue

            for choice in payload.get("choices", []):
                delta = choice.get("delta") or {}
                text = delta.get("content") or ""
                if text:
                    yield StreamChunk(content=text, raw=payload)
                finish_reason = choice.get("finish_reason")
                if finish_reason and finish_reason != "null":
                    yield StreamChunk(content="", is_final=True, raw=payload)

    def _build_payload(self, request: ChatRequest) -> Dict:
        payload: Dict[str, Optional[object]] = {
            "messages": [message.to_dict() for message in request.messages],
            "stream": request.stream,
            "model": request.model or self.model,
            "temperature": request.temperature,
            "top_p": request.top_p,
            "max_tokens": request.max_tokens,
            "stream_options": {"include_usage": True},
        }

        if request.round_id:
            payload["round_id"] = request.round_id

        if request.custom_payload:
            payload["custom"] = json.dumps(request.custom_payload, ensure_ascii=False)

        return {key: value for key, value in payload.items() if value is not None}

    def _build_headers(self, request_headers: Optional[Dict[str, str]]) -> Dict[str, str]:
        headers: Dict[str, str] = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        headers.update(self.extra_headers)
        if request_headers:
            headers.update(request_headers)
        return headers
