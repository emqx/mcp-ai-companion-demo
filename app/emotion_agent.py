import os
import logging
from typing import List, Optional, Dict, Any
from pathlib import Path

from llama_index.llms.openai_like import OpenAILike
from llama_index.core.agent import FunctionAgent
from llama_index.core.tools import BaseTool, FunctionTool

from mcp_client_init import McpMqttClient

logger = logging.getLogger(__name__)


class EmotionAgent:
    """Agent specialized in emotion control - manages avatar facial expressions"""
    
    def __init__(
        self,
        api_key: str = None,
        api_base: str = "https://dashscope.aliyuncs.com/compatible-mode/v1",
        model: str = "deepseek-v3",
        temperature: float = 0.3,  # Lower temperature for more consistent emotion control
        max_tokens: int = 1000,    # Shorter responses for emotion control
        system_prompt_file: str = "prompts/emotion_system_prompt.txt",
    ):
        # API Key
        self.api_key = api_key or os.environ.get("DASHSCOPE_API_KEY")
        if not self.api_key:
            raise ValueError("API key is required")

        # LLM initialization for emotion control
        self.llm = OpenAILike(
            model=model,
            api_key=self.api_key,
            api_base=api_base,
            is_chat_model=True,
            is_function_calling_model=True,
            temperature=temperature,
            max_tokens=max_tokens,
            timeout=30,
        )

        # Load system prompt from file
        self.system_prompt = self._load_system_prompt(system_prompt_file)

        # MCP tools and emotion agent
        self.mcp_tools: List = []
        self.mcp_client: Optional[McpMqttClient] = None
        self.agent: Optional[FunctionAgent] = None

    def _load_system_prompt(self, prompt_file: str) -> str:
        """Load system prompt"""
        prompt_path = Path(__file__).parent / prompt_file
        if prompt_path.exists():
            with open(prompt_path, "r", encoding="utf-8") as f:
                return f.read().strip()
        logger.warning(f"System prompt file not found: {prompt_path}")
        return """你是一个智能助手的表情控制器。
根据用户的输入和对话情境，智能判断是否需要改变头像表情。

可用的情绪: happy, sad, angry, surprised, thinking, playful, relaxed, serious, shy, tired, disappointed, laugh

你只需要调用 change_emotion 工具，不需要生成文本回复。"""

    def set_mcp_client(self, mcp_client: McpMqttClient):
        """Set MCP client"""
        self.mcp_client = mcp_client
        if mcp_client and mcp_client.mcp_tools:
            self.mcp_tools = mcp_client.mcp_tools
            self._initialize_agent()

    def _initialize_agent(self):
        """Initialize FunctionAgent"""
        if self.mcp_tools:
            # 只使用 change_emotion 工具
            filtered_tools = []
            for tool in self.mcp_tools:
                tool_name = getattr(tool.metadata, "name", str(tool))
                if tool_name == "change_emotion":
                    filtered_tools.append(tool)
            
            self.agent = FunctionAgent(
                tools=filtered_tools,
                llm=self.llm,
                verbose=False,
                system_prompt=self.system_prompt
            )

    async def determine_and_call_tools(self, user_input: str, context: str = "") -> Optional[Dict[str, Any]]:
        try:
            if not self.agent:
                logger.warning("FunctionAgent not initialized")
                return None
            
            logger.info("🤖 FunctionAgent processing user input...")
            
            import asyncio
            try:
                response = await asyncio.wait_for(self.agent.run(user_input), timeout=10.0)
                logger.info(f"FunctionAgent completed: {response}")
                
                return {
                    "tool_name": "function_agent", 
                    "tool_args": {"user_input": user_input},
                    "tool_result": str(response)
                }
            except asyncio.TimeoutError:
                logger.error("🤖 FunctionAgent timeout after 10s")
                return None
            
        except Exception as e:
            logger.error(f"Error in FunctionAgent: {e}")
            return None
