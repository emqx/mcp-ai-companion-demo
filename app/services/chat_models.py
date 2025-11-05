from __future__ import annotations

from typing import List, Optional, Tuple

from pydantic import BaseModel, field_validator

from llama_index.core.llms import ChatMessage


class MessagePayload(BaseModel):
    role: str
    content: Optional[str] = ""

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: str) -> str:
        if value not in {"user", "assistant", "system"}:
            raise ValueError("role must be one of: user, assistant, system")
        return value


class ChatStreamPayload(BaseModel):
    messages: List[MessagePayload]
    stream: Optional[bool] = True
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    model: Optional[str] = None
    top_p: Optional[float] = None
    custom: Optional[str] = None
    round_id: Optional[str] = None
    device_id: Optional[str] = None


def prepare_conversation(messages: List[MessagePayload]) -> Tuple[List[ChatMessage], ChatMessage]:
    if not messages:
        return [], ChatMessage(role="user", content="")

    converted = [ChatMessage(role=item.role, content=item.content or "") for item in messages]
    last_message = converted[-1]
    history = converted[:-1]

    if last_message.role != "user":
        history = converted
        last_message = ChatMessage(role="user", content="")

    return history, last_message
