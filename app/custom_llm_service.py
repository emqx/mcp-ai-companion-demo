from __future__ import annotations

import argparse
import json
import os
import time
import uuid
from dataclasses import replace
from typing import Any, AsyncGenerator, Dict, List, Optional

import anyio
import uvicorn
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_validator

from conversation_workflow import ConversationWorkflow, ResponseType
from llm import BaseLLMClient, ChatMessage, create_llm_client
from utils.colored_logger import get_agent_logger
from utils.config import LLMSettings, get_llm_settings

logger = get_agent_logger("custom_llm_service")


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


class ServiceState:
    def __init__(
        self,
        settings: LLMSettings,
        llm_client: BaseLLMClient,
        *,
        default_device_id: Optional[str] = None,
    ):
        self.settings = settings
        self.llm_client = llm_client
        self.workflow = ConversationWorkflow(llm_settings=settings, llm_client=llm_client)
        self.lock = anyio.Lock()
        self.default_device_id = default_device_id or os.getenv("CUSTOM_LLM_DEVICE_ID")
        self.mcp_server_name_prefix = os.getenv("MCP_SERVER_NAME_PREFIX", "web-ui-hardware-controller/")

    async def shutdown(self) -> None:
        try:
            await self.workflow.shutdown()
        except Exception as exc:  # pragma: no cover - defensive cleanup
            logger.warning(f"Failed to shutdown workflow cleanly: {exc}")

    async def ensure_mcp(self, device_id: Optional[str]) -> None:
        target_device = device_id or self.default_device_id

        if not target_device:
            return

        if self.workflow.mcp_client:
            if self.workflow.device_id and self.workflow.device_id != target_device:
                logger.warning(
                    "Workflow already bound to device '%s'; ignoring new device_id '%s'",
                    self.workflow.device_id,
                    target_device,
                )
            return

        if target_device.startswith(self.mcp_server_name_prefix):
            server_name_filter = target_device
        else:
            if "/" in target_device:
                suffix = target_device.rsplit("/", 1)[-1]
            elif "-" in target_device:
                suffix = target_device.split("-")[-1]
            else:
                suffix = target_device
            server_name_filter = f"{self.mcp_server_name_prefix}{suffix}"
        logger.info("Initializing MCP with device_id=%s filter=%s", target_device, server_name_filter)
        await self.workflow.init_mcp(server_name_filter=server_name_filter, device_id=target_device)
        self.default_device_id = target_device

    def snapshot_voice_agent_state(self) -> Dict[str, Any]:
        voice_agent = self.workflow.voice_agent
        return {
            "temperature": voice_agent.temperature,
            "top_p": voice_agent.top_p,
            "max_tokens": voice_agent.max_tokens,
            "model": voice_agent.model,
            "custom_payload": dict(voice_agent.custom_payload),
            "device_id": voice_agent.device_id,
        }

    def restore_voice_agent_state(self, snapshot: Dict[str, Any]) -> None:
        voice_agent = self.workflow.voice_agent
        voice_agent.temperature = snapshot["temperature"]
        voice_agent.top_p = snapshot["top_p"]
        voice_agent.max_tokens = snapshot["max_tokens"]
        voice_agent.model = snapshot["model"]
        voice_agent.custom_payload = dict(snapshot["custom_payload"])
        voice_agent.device_id = snapshot["device_id"]


def parse_custom_payload(raw: Optional[str]) -> Optional[Dict[str, Any]]:
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid custom payload: {exc}") from exc

    if not isinstance(parsed, dict):
        raise HTTPException(status_code=400, detail="Custom payload must be a JSON object")
    return dict(parsed)


def prepare_conversation(messages: List[MessagePayload]) -> tuple[List[ChatMessage], ChatMessage]:
    if not messages:
        raise HTTPException(status_code=400, detail="messages must not be empty")

    converted = [ChatMessage(role=item.role, content=item.content or "") for item in messages]
    last_message = converted[-1]
    if last_message.role != "user":
        raise HTTPException(status_code=400, detail="The last message must have role 'user'")

    history = converted[:-1]
    return history, last_message


def make_delta_chunk(
    response_id: str,
    model: str,
    created: int,
    stream_options: dict,
    token: str,
) -> dict:
    return {
        "id": response_id,
        "object": "chat.completion.chunk",
        "choices": [
            {
                "index": 0,
                "delta": {"content": token},
                "finish_reason": None,
            }
        ],
        "model": model,
        "created": created,
        "stream_options": stream_options,
    }


def make_final_chunk(
    response_id: str,
    model: str,
    created: int,
    stream_options: dict,
    aggregated_text: str,
    prompt_message_count: int,
) -> dict:
    usage = {
        "prompt_tokens": prompt_message_count,
        "completion_tokens": max(len(aggregated_text), 1),
        "total_tokens": prompt_message_count + max(len(aggregated_text), 1),
    }
    return {
        "id": response_id,
        "object": "chat.completion.chunk",
        "choices": [
            {
                "index": 0,
                "delta": {},
                "finish_reason": "stop",
            }
        ],
        "model": model,
        "created": created,
        "stream_options": stream_options,
        "usage": usage,
    }


def format_sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def build_app(
    *,
    settings: Optional[LLMSettings] = None,
    llm_client: Optional[BaseLLMClient] = None,
    expected_api_key: Optional[str] = None,
    default_device_id: Optional[str] = None,
) -> FastAPI:
    llm_settings = replace(settings or get_llm_settings())
    if llm_settings.custom_options:
        llm_settings.custom_options = replace(llm_settings.custom_options)

    client = llm_client or create_llm_client(llm_settings)
    state = ServiceState(
        settings=llm_settings,
        llm_client=client,
        default_device_id=default_device_id,
    )

    async def lifespan(_: FastAPI):
        try:
            await state.ensure_mcp(state.default_device_id)
        except Exception as exc:  # pragma: no cover - defensive logging
            logger.warning(f"Failed to pre-initialize MCP: {exc}")
        try:
            yield
        finally:
            await state.shutdown()

    app = FastAPI(title="Custom LLM SSE Service", lifespan=lifespan)
    app.state.service_state = state
    app.state.expected_api_key = expected_api_key

    async def verify_authorization(authorization: Optional[str] = Header(None)):
        expected = app.state.expected_api_key
        if expected is None:
            return
        if not authorization:
            raise HTTPException(status_code=401, detail="Missing Authorization header")
        if authorization != f"Bearer {expected}":
            raise HTTPException(status_code=401, detail="Invalid Authorization header")

    @app.post("/chat-stream")
    async def chat_stream(
        payload: ChatStreamPayload,
        _: None = Depends(verify_authorization),
    ):
        service_state: ServiceState = app.state.service_state
        stream_flag = True if payload.stream is None else bool(payload.stream)
        custom_payload = parse_custom_payload(payload.custom)

        device_id = payload.device_id
        if not device_id and custom_payload and "device_id" in custom_payload:
            device_id = str(custom_payload.pop("device_id"))

        response_id = str(uuid.uuid4())
        created = int(time.time())
        stream_options = {"include_usage": True}

        async def stream_events() -> AsyncGenerator[str, None]:
            async with service_state.lock:
                voice_agent = service_state.workflow.voice_agent
                workflow = service_state.workflow
                history, user_message = prepare_conversation(payload.messages)
                prompt_message_count = len(history) + 1

                await service_state.ensure_mcp(device_id)

                snapshot = service_state.snapshot_voice_agent_state()
                voice_agent.history = list(history)

                if payload.temperature is not None:
                    voice_agent.temperature = payload.temperature
                if payload.top_p is not None:
                    voice_agent.top_p = payload.top_p
                if payload.max_tokens is not None:
                    voice_agent.max_tokens = payload.max_tokens
                if custom_payload is not None:
                    base_payload = dict(snapshot["custom_payload"])
                    base_payload.update(custom_payload)
                    voice_agent.custom_payload = base_payload

                model_override = payload.model or service_state.settings.model
                voice_agent.model = model_override

                if device_id:
                    workflow.device_id = device_id
                    voice_agent.device_id = device_id
                    service_state.default_device_id = device_id
                elif workflow.device_id:
                    service_state.default_device_id = workflow.device_id

                model_name = voice_agent.model or service_state.settings.model or ""

                aggregated_text = ""
                initial_payload = {
                    "id": response_id,
                    "object": "chat.completion.chunk",
                    "choices": [
                        {"index": 0, "delta": {"role": "assistant"}, "finish_reason": None}
                    ],
                    "model": model_name,
                    "created": created,
                    "stream_options": stream_options,
                }

                try:
                    if stream_flag:
                        yield format_sse(initial_payload)

                    async for response in workflow.stream_chat(user_input=user_message.content):
                        if response.type == ResponseType.STREAM_CHUNK:
                            token = response.content or ""
                            if token:
                                aggregated_text += token
                                if stream_flag:
                                    yield format_sse(
                                        make_delta_chunk(
                                            response_id,
                                            model_name,
                                            created,
                                            stream_options,
                                            token,
                                        )
                                    )
                        elif response.type == ResponseType.TOOL_CALL:
                            logger.debug("Tool call result: %s", response.tool_result)
                        elif response.type == ResponseType.ERROR:
                            raise HTTPException(status_code=500, detail=response.content)
                        elif response.type == ResponseType.STREAM_END:
                            break

                    if not stream_flag:
                        yield format_sse(initial_payload)
                        if aggregated_text:
                            yield format_sse(
                                make_delta_chunk(
                                    response_id,
                                    model_name,
                                    created,
                                    stream_options,
                                    aggregated_text,
                                )
                            )

                    final_payload = make_final_chunk(
                        response_id,
                        model_name,
                        created,
                        stream_options,
                        aggregated_text,
                        prompt_message_count,
                    )
                    yield format_sse(final_payload)
                    yield "data: [DONE]\n\n"
                except HTTPException:
                    raise
                except Exception as exc:
                    logger.error(f"Workflow streaming failed: {exc}")
                    raise HTTPException(status_code=500, detail=str(exc)) from exc
                finally:
                    service_state.restore_voice_agent_state(snapshot)

        return StreamingResponse(stream_events(), media_type="text/event-stream")

    return app


def main():
    parser = argparse.ArgumentParser(description="Run Custom LLM SSE service")
    parser.add_argument("--host", default="0.0.0.0", help="Service host (default: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=8081, help="Service port (default: 8081)")
    parser.add_argument("--api-key", default=None, help="Bearer token to require from requests (overrides CUSTOM_LLM_API_KEY)")
    parser.add_argument("--device-id", default=None, help="Default MCP device id to bind on startup (overrides CUSTOM_LLM_DEVICE_ID)")
    args = parser.parse_args()

    expected_api_key = args.api_key or os.getenv("CUSTOM_LLM_API_KEY")

    try:
        app = build_app(expected_api_key=expected_api_key, default_device_id=args.device_id)
    except Exception as exc:
        logger.error(f"Failed to initialize LLM client: {exc}")
        raise

    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
