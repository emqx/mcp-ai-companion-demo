"""Unified system prompt loading utility"""
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


def load_system_prompt(prompt_file: str) -> str:
    """
    Load system prompt from file

    Args:
        prompt_file: Relative path to prompt file (e.g., "prompts/voice_reply_system_prompt.txt")

    Returns:
        System prompt content

    Raises:
        FileNotFoundError: If prompt file doesn't exist
        ValueError: If prompt file is empty
    """
    prompt_path = Path(__file__).parent.parent / prompt_file

    if not prompt_path.exists():
        raise FileNotFoundError(f"System prompt file not found: {prompt_path}")

    try:
        with open(prompt_path, "r", encoding="utf-8") as f:
            content = f.read().strip()
            if not content:
                raise ValueError(f"System prompt file is empty: {prompt_path}")
            return content
    except Exception as e:
        logger.error(f"Error reading system prompt file {prompt_path}: {e}")
        raise
