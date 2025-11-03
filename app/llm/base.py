import asyncio
import uuid
from dataclasses import dataclass, field
from typing import (
    AsyncGenerator,
    Dict,
    Iterable,
    List,
    Optional,
    Protocol,
)


class LLMException(RuntimeError):
    """Raised for LLM client errors."""


@dataclass
class ChatMessage:
    role: str
    content: str

    def to_dict(self) -> Dict[str, str]:
        return {"role": self.role, "content": self.content}


@dataclass
class ChatRequest:
    messages: List[ChatMessage]
    model: Optional[str] = None
    temperature: Optional[float] = None
    top_p: Optional[float] = None
    max_tokens: Optional[int] = None
    stream: bool = True
    custom_payload: Optional[Dict[str, str]] = None
    extra_headers: Optional[Dict[str, str]] = None
    round_id: Optional[str] = None


@dataclass
class StreamChunk:
    content: str = ""
    is_final: bool = False
    raw: Optional[Dict] = None


@dataclass
class ChatResponse:
    text: str
    raw: Optional[Dict] = field(default=None)


class BaseLLMClient(Protocol):
    name: str

    async def stream_chat(self, request: ChatRequest) -> AsyncGenerator[StreamChunk, None]:
        ...

    async def complete(self, request: ChatRequest) -> ChatResponse:
        ...


def create_round_id() -> str:
    return uuid.uuid4().hex


def truncate_messages(messages: Iterable[ChatMessage], history_length: int) -> List[ChatMessage]:
    """Keep the last N user/assistant message pairs plus system prompts."""
    system_messages: List[ChatMessage] = []
    conversation: List[ChatMessage] = []

    for message in messages:
        if message.role == "system":
            system_messages.append(message)
        else:
            conversation.append(message)

    if history_length <= 0:
        return system_messages + conversation

    trimmed: List[ChatMessage] = []
    user_assistant_pairs = 0
    idx = len(conversation) - 1
    # Walk backwards and retain user/assistant pairs
    while idx >= 0 and user_assistant_pairs < history_length * 2:
        trimmed.insert(0, conversation[idx])
        idx -= 1
        user_assistant_pairs += 1

    return system_messages + trimmed


async def async_retry(callback, retries: int = 2, *, delay: float = 0.5):
    """Retry helper for async callables."""
    attempt = 0
    while True:
        try:
            return await callback()
        except Exception:
            attempt += 1
            if attempt > retries:
                raise
            await asyncio.sleep(delay)
