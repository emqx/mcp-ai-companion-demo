import os
import time
import logging
from typing import List, AsyncGenerator, Optional
from pathlib import Path

from llama_index.llms.openai_like import OpenAILike
from llama_index.core.llms import ChatMessage, MessageRole
from llama_index.core.agent import FunctionAgent
from llama_index.core.tools import BaseTool, FunctionTool
from llama_index.core.memory import Memory

from tools import explain_photo, explain_photo_async

logger = logging.getLogger(__name__)


class VoiceAgent:
    """Voice agent with FunctionAgent - supports tool calling and streaming text generation"""
    
    def __init__(
        self,
        api_key: str = None,
        api_base: str = "https://dashscope.aliyuncs.com/compatible-mode/v1",
        model: str = "deepseek-v3",
        temperature: float = 0.7,    # Higher temperature for more creative responses
        max_tokens: int = 60000,     # Longer responses for conversation
        max_history_length: int = 20,
        system_prompt_file: str = "prompts/voice_reply_system_prompt.txt",
        device_id: Optional[str] = None,
    ):
        # API Key
        self.api_key = api_key or os.environ.get("DASHSCOPE_API_KEY")
        if not self.api_key:
            raise ValueError("API key is required")

        # LLM initialization for conversation
        self.llm = OpenAILike(
            model=model,
            api_key=self.api_key,
            api_base=api_base,
            is_chat_model=True,
            is_function_calling_model=True,
            temperature=temperature,
            max_tokens=max_tokens,
            timeout=60,
        )

        self.system_prompt = self._load_system_prompt(system_prompt_file)
        
        # Tools and agent
        self.tools: List[BaseTool] = []
        self.mcp_tools: List[BaseTool] = []
        self._init_base_tools()
        
        self.memory = Memory.from_defaults(
            token_limit=1000,
            session_id=f"session_{device_id or 'voice'}"
        )
        
        # Agent instance
        self.agent: Optional[FunctionAgent] = None
        self._initialize_agent()

    def _load_system_prompt(self, prompt_file: str) -> str:
        """Load system prompt"""
        prompt_path = Path(__file__).parent / prompt_file
        if prompt_path.exists():
            with open(prompt_path, "r", encoding="utf-8") as f:
                return f.read().strip()
        logger.warning(f"System prompt file not found: {prompt_path}")
        return "You are an intelligent assistant. Please answer user questions in a friendly manner."

    def _init_base_tools(self):
        """Initialize base tools"""
        photo_tool = FunctionTool.from_defaults(
            fn=explain_photo,
            name="explain_photo",
            description=(
                "Analyze and explain a photo based on a specific question. "
                "Required parameters: image_url (string) - the URL of the image to analyze, "
                "question (string) - the specific question about the image. "
                "Returns: A text description answering the question about the image."
            ),
            async_fn=explain_photo_async,
        )
        self.tools.append(photo_tool)

    def _initialize_agent(self):
        """Initialize agent"""
        # Filter out change_emotion tool, other tools can be used
        filtered_mcp_tools = []
        
        for tool in self.mcp_tools:
            tool_name = getattr(tool.metadata, "name", str(tool))
            if tool_name != "change_emotion":
                filtered_mcp_tools.append(tool)
        
        all_tools = self.tools + filtered_mcp_tools

        self.agent = FunctionAgent(
            tools=all_tools,
            llm=self.llm,
            system_prompt=self.system_prompt,
            verbose=False,
            streaming=True,
            timeout=30.0,
        )

        logger.info(f"🗣️ Voice agent initialized with {len(all_tools)} tools")
    
    def set_mcp_tools(self, mcp_tools: List[BaseTool]):
        """Set MCP tools"""
        self.mcp_tools = mcp_tools
        self._initialize_agent()

    async def generate_response_stream(self, user_input: str) -> AsyncGenerator[str, None]:
        """Generate streaming response - using FunctionAgent"""
        try:
            start_time = time.time()
            logger.info(f"🗣️ Voice response agent generating for: '{user_input}'")
            
            if not self.agent:
                logger.error("Voice agent not initialized")
                yield "Sorry, voice agent not initialized."
                return
                
            accumulated_content = ""
            first_token_time = None
            
            # Use FunctionAgent to generate streaming response
            stream_start = time.time()
            handler = self.agent.run(user_msg=user_input, memory=self.memory)
            
            async for event in handler.stream_events():
                # Extract content
                token = None
                if hasattr(event, 'delta') and event.delta:
                    token = event.delta
                elif hasattr(event, 'chunk') and event.chunk:
                    token = event.chunk

                if token:
                    # Record first token time
                    if first_token_time is None:
                        first_token_time = time.time()
                        time_to_first_token = first_token_time - start_time
                        logger.info(f"⚡ Voice first token: {time_to_first_token:.3f}s")
                    
                    accumulated_content += token
                    yield token
            
            stream_end = time.time()
            total_time = stream_end - start_time
            stream_time = stream_end - stream_start
            
            logger.info(f"🗣️ Voice response complete: {total_time:.3f}s total, {stream_time:.3f}s stream, {len(accumulated_content)} chars")

        except Exception as e:
            logger.error(f"Error in voice response generation: {e}")
            yield f"Sorry, I encountered some issues: {str(e)}"


    def clear_history(self):
        """Clear conversation history"""
        logger.info("🗣️ Voice response history cleared")
        self.memory.reset()

    def get_stats(self) -> dict:
        """Get conversation statistics"""
        return {
            "agent_type": "Voice Agent (FunctionAgent)",
            "tools_count": len(self.tools) + len(self.mcp_tools),
            "agent_initialized": self.agent is not None
        }