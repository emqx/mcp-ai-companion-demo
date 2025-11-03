from __future__ import annotations

from typing import Optional

from utils.config import LLMSettings

from .base import BaseLLMClient
from .custom import CustomLLMClient
from .dashscope import DashScopeLLMClient


def create_llm_client(settings: LLMSettings, *, timeout: Optional[float] = None) -> BaseLLMClient:
    provider = settings.provider.lower()

    if provider in {"dashscope", "dash_scope", "qiqi"}:
        if not settings.api_key:
            raise ValueError("DashScope provider requires LLM_API_KEY or DASHSCOPE_API_KEY")
        return DashScopeLLMClient(
            api_key=settings.api_key,
            api_base=settings.api_base or "https://dashscope.aliyuncs.com/compatible-mode/v1",
            model=settings.model,
            timeout=timeout or 60.0,
        )

    if provider == "custom":
        if not settings.custom_options:
            raise ValueError("Custom LLM provider requires custom_options in configuration")
        options = settings.custom_options
        return CustomLLMClient(
            url=options.url,
            model=options.model or settings.model,
            api_key=options.api_key,
            extra_headers=options.extra_headers,
            timeout=timeout or options.timeout,
            max_retries=options.max_retries,
        )

    raise ValueError(f"Unsupported LLM_PROVIDER: {settings.provider}")
