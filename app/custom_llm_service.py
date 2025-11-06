from __future__ import annotations

import argparse
import os
import time
import uuid
from pathlib import Path
from dataclasses import replace
from typing import Callable, Optional, TYPE_CHECKING

import uvicorn
from fastapi import Depends, FastAPI, Header, HTTPException, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse, FileResponse
from fastapi.exceptions import RequestValidationError

from services.chat_models import ChatStreamPayload
from services.chat_stream_utils import parse_custom_payload, stream_chat_response
from services.custom_llm_state import ServiceState
from utils.colored_logger import get_agent_logger
from utils.config import LLMSettings, get_llm_settings

if TYPE_CHECKING:
    from conversation_workflow import ConversationWorkflow


logger = get_agent_logger("custom_llm_service")

APP_DIR = Path(__file__).resolve().parent
DEFAULT_UPLOAD_DIR = APP_DIR / "uploads"


def resolve_upload_dir() -> Path:
    """Resolve the upload directory, defaulting inside the app package."""
    configured = os.getenv("PHOTO_UPLOAD_DIR")
    if not configured:
        return DEFAULT_UPLOAD_DIR

    candidate = Path(configured).expanduser()
    if not candidate.is_absolute():
        candidate = (APP_DIR / candidate).resolve()
    else:
        candidate = candidate.resolve()

    return candidate


UPLOAD_DIR = resolve_upload_dir()


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

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    logger.info("Using photo upload directory: %s", UPLOAD_DIR)

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

    @app.middleware('http')
    async def log_chat_stream_request(request: Request, call_next):
        if request.url.path == '/chat-stream':
            body = await request.body()
            try:
                logger.info('Raw request body: %s', body.decode('utf-8', errors='replace'))
            except Exception:  # pragma: no cover - defensive
                logger.info('Raw request body (binary, %d bytes)', len(body))

        response = await call_next(request)
        return response

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        logger.error(
            "Request validation failed: %s",
            {
                "path": str(request.url),
                "errors": exc.errors(),
                "body": exc.body,
            },
        )
        return JSONResponse(status_code=422, content={"detail": exc.errors()})

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
        logger.info("Chat payload received: %s", payload.model_dump())
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

    @app.post("/api/upload")
    async def upload_photo(file: UploadFile = File(...)):
        filename = Path(file.filename or "")
        suffix = filename.suffix if filename.suffix else ".jpg"
        file_id = f"{uuid.uuid4().hex}{suffix}"
        destination = UPLOAD_DIR / file_id

        try:
            with destination.open("wb") as buffer:
                while True:
                    chunk = await file.read(1024 * 1024)
                    if not chunk:
                        break
                    buffer.write(chunk)
        finally:
            await file.close()

        logger.info("Photo uploaded: %s (%s)", file_id, destination)
        return {"file_id": file_id}

    @app.get("/api/download/{file_id}")
    async def download_photo(file_id: str):
        safe_id = Path(file_id).name
        file_path = UPLOAD_DIR / safe_id
        if not file_path.exists() or not file_path.is_file():
            raise HTTPException(status_code=404, detail="File not found")

        return FileResponse(file_path, filename=file_path.name)

    return app


def main():
    parser = argparse.ArgumentParser(description="Run Custom LLM SSE service")
    parser.add_argument("--host", default="0.0.0.0", help="Service host (default: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=8081, help="Service port (default: 8081)")
    parser.add_argument("--api-key", default=None, help="Bearer token to require from requests (overrides CUSTOM_LLM_API_KEY)")
    parser.add_argument("--ssl-certfile", default=None, help="Path to TLS certificate file (PEM)")
    parser.add_argument("--ssl-keyfile", default=None, help="Path to TLS private key file (PEM)")
    parser.add_argument("--ssl-keyfile-password", default=None, help="Password for the TLS private key, if encrypted")
    parser.add_argument("--ssl-ca-certs", default=None, help="Path to custom CA bundle for client verification")
    args = parser.parse_args()

    if (args.ssl_certfile and not args.ssl_keyfile) or (args.ssl_keyfile and not args.ssl_certfile):
        parser.error("--ssl-certfile and --ssl-keyfile must be provided together")

    expected_api_key = args.api_key or os.getenv("CUSTOM_LLM_API_KEY")

    try:
        app = build_app(expected_api_key=expected_api_key)
    except Exception as exc:
        logger.error(f"Failed to initialize service: {exc}")
        raise

    ssl_kwargs = {}
    if args.ssl_certfile:
        ssl_kwargs["ssl_certfile"] = args.ssl_certfile
        ssl_kwargs["ssl_keyfile"] = args.ssl_keyfile
        if args.ssl_keyfile_password:
            ssl_kwargs["ssl_keyfile_password"] = args.ssl_keyfile_password
        if args.ssl_ca_certs:
            ssl_kwargs["ssl_ca_certs"] = args.ssl_ca_certs

    uvicorn.run(app, host=args.host, port=args.port, log_level="info", **ssl_kwargs)


if __name__ == "__main__":
    main()
