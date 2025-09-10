import logging
from typing import Dict, Any


class ColoredFormatter(logging.Formatter):
    """Colored log formatter for different agents"""

    # ANSI color codes
    COLORS = {
        'RESET': '\033[0m',
        'RED': '\033[31m',
        'GREEN': '\033[32m',
        'YELLOW': '\033[33m',
        'BLUE': '\033[34m',
        'MAGENTA': '\033[35m',
        'CYAN': '\033[36m',
        'WHITE': '\033[37m',
        'BRIGHT_RED': '\033[91m',
        'BRIGHT_GREEN': '\033[92m',
        'BRIGHT_YELLOW': '\033[93m',
        'BRIGHT_BLUE': '\033[94m',
        'BRIGHT_MAGENTA': '\033[95m',
        'BRIGHT_CYAN': '\033[96m',
        'BRIGHT_WHITE': '\033[97m',
    }

    # Agent colors mapping
    AGENT_COLORS = {
        'voice': 'BRIGHT_BLUE',
        'emotion': 'MAGENTA',
        'mcp': 'BRIGHT_CYAN',
        'main': 'BRIGHT_GREEN',
        'default': 'WHITE'
    }

    # Log level colors
    LEVEL_COLORS = {
        'DEBUG': 'CYAN',
        'INFO': 'GREEN',
        'WARNING': 'YELLOW',
        'ERROR': 'RED',
        'CRITICAL': 'BRIGHT_RED'
    }

    def format(self, record: logging.LogRecord) -> str:
        # Get original message
        original_msg = record.getMessage()

        # Detect agent type from message content or logger name
        agent_type = self._detect_agent_type(original_msg, record.name)

        # Get colors
        agent_color = self.COLORS.get(self.AGENT_COLORS.get(agent_type, 'default'), '')
        level_color = self.COLORS.get(self.LEVEL_COLORS.get(record.levelname, 'WHITE'), '')
        reset_color = self.COLORS['RESET']

        # Create colored message
        colored_msg = f"{agent_color}[{agent_type.upper()}]{reset_color} {level_color}{original_msg}{reset_color}"

        # Update record message
        record.msg = colored_msg
        record.args = ()

        return super().format(record)

    def _detect_agent_type(self, message: str, logger_name: str) -> str:
        """Detect agent type from message content or logger name"""
        message_lower = message.lower()

        # Check message content for agent indicators
        if '[voice agent]' in message_lower or 'voice agent' in message_lower:
            return 'voice'
        elif '[emotion agent]' in message_lower or 'emotion agent' in message_lower:
            return 'emotion'
        elif '[mcp' in message_lower or 'mcp' in message_lower:
            return 'mcp'

        # Check logger name
        if 'voice' in logger_name:
            return 'voice'
        elif 'emotion' in logger_name:
            return 'emotion'
        elif 'mcp' in logger_name:
            return 'mcp'
        elif 'main' in logger_name or '__main__' in logger_name:
            return 'main'

        return 'default'


def setup_colored_logger(name: str = None, level: int = logging.INFO) -> logging.Logger:
    """Setup colored logger for agents"""
    logger = logging.getLogger(name)

    # Remove existing handlers to avoid duplicates
    for handler in logger.handlers[:]:
        logger.removeHandler(handler)

    # Create console handler
    console_handler = logging.StreamHandler()
    console_handler.setLevel(level)

    # Create colored formatter
    formatter = ColoredFormatter(
        fmt='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%H:%M:%S'
    )
    console_handler.setFormatter(formatter)

    # Add handler to logger
    logger.addHandler(console_handler)
    logger.setLevel(level)
    logger.propagate = False  # Prevent duplicate logs

    return logger


def get_agent_logger(agent_name: str, level: int = logging.INFO) -> logging.Logger:
    """Get a colored logger for specific agent"""
    return setup_colored_logger(f"{agent_name}_agent", level)
