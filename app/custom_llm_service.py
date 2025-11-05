from __future__ import annotations

import argparse
import os
import time
import uuid
from dataclasses import replace
from typing import Callable, Optional, TYPE_CHECKING

import uvicorn
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from services.chat_models import ChatStreamPayload
from services.chat_stream_utils import parse_custom_payload, stream_chat_response
from services.custom_llm_state import ServiceState
from utils.colored_logger import get_agent_logger
from utils.config import LLMSettings, get_llm_settings

if TYPE_CHECKING:
    from conversation_workflow import ConversationWorkflow


logger = get_agent_logger("custom_llm_service")


def build_app(
    *,
    settings: Optional[LLMSettings] = None,
    expected_api_key: Optional[str] = None,
    workflow_factory: Optional[Callable[[LLMSettings], "ConversationWorkflow"]] = None,
) -> FastAPI:
    llm_settings = replace(settings or get_llm_settings())
    if llm_settings.custom_options:
        llm_settings.custom_options = replace(llm_settings.custom_options)

    state = ServiceState(
        settings=llm_settings,
        workflow_factory=workflow_factory,
    )

    async def lifespan(_: FastAPI):
        await state.start()
        try:
            yield
        finally:
            await state.shutdown()

    app = FastAPI(title="Custom LLM SSE Service", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
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
        if device_id:
            payload.device_id = device_id

        response_id = str(uuid.uuid4())
        created = int(time.time())
        stream_options = {"include_usage": True}

        stream = stream_chat_response(
            payload,
            service_state=service_state,
            stream_flag=stream_flag,
            response_id=response_id,
            created=created,
            stream_options=stream_options,
            custom_payload=custom_payload,
            logger=logger,
        )

        return StreamingResponse(stream, media_type="text/event-stream")

    return app


def main():
    parser = argparse.ArgumentParser(description="Run Custom LLM SSE service")
    parser.add_argument("--host", default="0.0.0.0", help="Service host (default: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=8081, help="Service port (default: 8081)")
    parser.add_argument("--api-key", default=None, help="Bearer token to require from requests (overrides CUSTOM_LLM_API_KEY)")
    args = parser.parse_args()

    expected_api_key = args.api_key or os.getenv("CUSTOM_LLM_API_KEY")

    try:
        app = build_app(expected_api_key=expected_api_key)
    except Exception as exc:
        logger.error(f"Failed to initialize service: {exc}")
        raise

    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
