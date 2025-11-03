from __future__ import annotations

import json
from typing import Any, AsyncGenerator, Dict, Optional

from fastapi import HTTPException

from conversation_workflow import ResponseType
from services.chat_models import ChatStreamPayload, MessagePayload, prepare_conversation
from services.custom_llm_state import ServiceState


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


def make_delta_chunk(
    response_id: str,
    model: str,
    created: int,
    stream_options: Dict[str, Any],
    token: str,
) -> Dict[str, Any]:
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
    stream_options: Dict[str, Any],
    aggregated_text: str,
    prompt_message_count: int,
) -> Dict[str, Any]:
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


def format_sse(payload: Dict[str, Any]) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


async def stream_chat_response(
    payload: ChatStreamPayload,
    *,
    service_state: ServiceState,
    stream_flag: bool,
    response_id: str,
    created: int,
    stream_options: Dict[str, Any],
    custom_payload: Optional[Dict[str, Any]],
    logger,
) -> AsyncGenerator[str, None]:
    try:
        history, user_message = prepare_conversation(payload.messages)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    async with service_state.lock:
        voice_agent = service_state.workflow.voice_agent
        workflow = service_state.workflow
        prompt_message_count = len(history) + 1

        await service_state.ensure_mcp(payload.device_id)

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

        if payload.device_id:
            workflow.device_id = payload.device_id
            voice_agent.device_id = payload.device_id
            service_state.default_device_id = payload.device_id
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

            trimmed_reply = aggregated_text.strip()
            if trimmed_reply:
                logger.info("assistant reply: %s", trimmed_reply)

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
        except Exception as exc:  # pragma: no cover - defensive
            logger.error("Workflow streaming failed: %s", exc)
            raise HTTPException(status_code=500, detail=str(exc)) from exc
        finally:
            service_state.restore_voice_agent_state(snapshot)
