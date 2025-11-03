import json
import os
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any, Dict, List, Optional


class ConfigError(RuntimeError):
    """Raised when environment configuration is invalid."""


@dataclass
class CustomLLMOptions:
    url: str
    model: str
    api_key: Optional[str] = None
    extra_headers: Dict[str, str] = field(default_factory=dict)
    custom_payload: Dict[str, Any] = field(default_factory=dict)
    history_length: int = 5
    enable_round_id: bool = False
    timeout: float = 30.0
    max_retries: int = 2


@dataclass
class LLMSettings:
    provider: str
    model: str
    api_key: Optional[str] = None
    api_base: Optional[str] = None
    temperature: float = 0.6
    top_p: float = 1.0
    max_tokens: int = 500
    system_messages: List[str] = field(default_factory=list)
    user_prompts: List[Dict[str, str]] = field(default_factory=list)
    history_length: int = 5
    enable_round_id: bool = False
    custom_options: Optional[CustomLLMOptions] = None


def _parse_json_env(name: str, default: Any) -> Any:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ConfigError(f"Environment variable {name} is not valid JSON: {exc}") from exc


def _get_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return float(raw)
    except ValueError as exc:
        raise ConfigError(f"Environment variable {name} is not a valid float: {raw}") from exc


def _get_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError as exc:
        raise ConfigError(f"Environment variable {name} is not a valid integer: {raw}") from exc


@lru_cache(maxsize=1)
def get_llm_settings() -> LLMSettings:
    provider = os.getenv("LLM_PROVIDER", "dashscope").strip().lower()
    model = os.getenv("LLM_MODEL", "qwen-flash")
    api_key = os.getenv("LLM_API_KEY") or os.getenv("DASHSCOPE_API_KEY")
    api_base = os.getenv("LLM_API_BASE", "https://dashscope.aliyuncs.com/compatible-mode/v1")

    system_messages = _parse_json_env("LLM_SYSTEM_MESSAGES", [])
    user_prompts = _parse_json_env("LLM_USER_PROMPTS", [])

    temperature = _get_float("LLM_TEMPERATURE", float(os.getenv("VOICE_TEMPERATURE", 0.5)))
    top_p = _get_float("LLM_TOP_P", 1.0)
    max_tokens = _get_int("LLM_MAX_TOKENS", 5000)
    history_length = _get_int("LLM_HISTORY_LENGTH", 5)
    enable_round_id = os.getenv("LLM_ENABLE_ROUND_ID", "false").lower() in {"1", "true", "yes"}

    settings = LLMSettings(
        provider=provider,
        model=model,
        api_key=api_key,
        api_base=api_base,
        temperature=temperature,
        top_p=top_p,
        max_tokens=max_tokens,
        system_messages=system_messages,
        user_prompts=user_prompts,
        history_length=history_length,
        enable_round_id=enable_round_id,
    )

    if provider == "custom":
        custom_url = os.getenv("CUSTOM_LLM_URL")
        if not custom_url:
            raise ConfigError("CUSTOM_LLM_URL must be set when LLM_PROVIDER=custom")

        custom_model = os.getenv("CUSTOM_LLM_MODEL", model)
        api_key = os.getenv("CUSTOM_LLM_API_KEY")
        extra_headers = _parse_json_env("CUSTOM_LLM_HEADERS", {})
        if not isinstance(extra_headers, dict):
            raise ConfigError("CUSTOM_LLM_HEADERS must be a JSON object")

        custom_payload = _parse_json_env("CUSTOM_LLM_CUSTOM_PAYLOAD", {})
        if not isinstance(custom_payload, dict):
            raise ConfigError("CUSTOM_LLM_CUSTOM_PAYLOAD must be a JSON object")

        custom_history_length = _get_int("CUSTOM_LLM_HISTORY_LENGTH", history_length)
        custom_enable_round_id = os.getenv("CUSTOM_LLM_ENABLE_ROUND_ID", str(enable_round_id)).lower() in {"1", "true", "yes"}
        timeout = _get_float("CUSTOM_LLM_TIMEOUT", 30.0)
        max_retries = _get_int("CUSTOM_LLM_MAX_RETRIES", 2)

        settings.custom_options = CustomLLMOptions(
            url=custom_url,
            model=custom_model,
            api_key=api_key,
            extra_headers={str(k): str(v) for k, v in extra_headers.items()},
            custom_payload=custom_payload,
            history_length=custom_history_length,
            enable_round_id=custom_enable_round_id,
            timeout=timeout,
            max_retries=max_retries,
        )

    return settings
