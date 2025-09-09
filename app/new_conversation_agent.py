import os
import time
import json
import anyio
import logging
from typing import List, Optional, AsyncGenerator, Dict, Any
from dataclasses import dataclass
from enum import Enum

from mcp_client_init import McpMqttClient
from mcp.shared.mqtt import MqttOptions
from emotion_agent import EmotionAgent
from voice_agent import VoiceAgent

logger = logging.getLogger(__name__)


class ResponseType(Enum):
    STREAM_CHUNK = "stream_chunk"
    STREAM_END = "stream_end"
    TOOL_CALL = "tool_call"
    ERROR = "error"


@dataclass
class AgentResponse:
    type: ResponseType
    content: str = ""
    tool_name: Optional[str] = None
    tool_args: Optional[Dict[str, Any]] = None
    tool_result: Optional[str] = None


class NewConversationAgent:
    """New conversation agent that coordinates voice responses and tool calls"""
    
    def __init__(
        self,
        api_key: str = None,
        api_base: str = "https://dashscope.aliyuncs.com/compatible-mode/v1",
        model: str = "deepseek-v3",
        voice_prompt_file: str = "prompts/voice_reply_system_prompt.txt",
        tool_prompt_file: str = "prompts/tool_call_system_prompt.txt",
        temperature: float = 0.7,
        max_tokens: int = 60000,
        max_history_length: int = 20,
        device_id: Optional[str] = None,
    ):
        self.api_key = api_key or os.environ.get("DASHSCOPE_API_KEY")
        if not self.api_key:
            raise ValueError("API key is required")
        
        self.device_id = device_id
        
        # Initialize voice response agent
        self.voice_agent = VoiceAgent(
            api_key=self.api_key,
            api_base=api_base,
            model=model,
            system_prompt_file=voice_prompt_file,
            temperature=temperature,
            max_tokens=max_tokens,
            max_history_length=max_history_length,
            device_id=device_id,
        )
        
        # Initialize emotion control agent
        self.emotion_agent = EmotionAgent(
            api_key=self.api_key,
            api_base=api_base,
            model=model,
            system_prompt_file=tool_prompt_file,
            temperature=0.3,  # Lower temperature for consistent tool calling
            max_tokens=1000,  # Shorter for tool calling
        )
        
        # MCP related
        self.mcp_client: Optional[McpMqttClient] = None
        
        logger.info("🚀 New Conversation Agent initialized")

    async def init_mcp(
        self,
        tg: anyio.abc.TaskGroup,
        server_name_filter: str = "#",
        device_id: Optional[str] = None
    ):
        """Initialize MCP client"""
        device_to_use = device_id or self.device_id
        
        mqtt_options = MqttOptions(
            host=os.getenv("MQTT_BROKER_HOST") or "localhost",
            port=int(os.getenv("MQTT_BROKER_PORT") or 1883),
            username=None,
            password=None,
        )
        
        mqtt_clientid = os.getenv("MQTT_CLIENT_ID") or f"mcp_ai_companion_{os.getpid()}"
        
        self.mcp_client = McpMqttClient(
            mqtt_options=mqtt_options,
            client_name="ai_companion_demo",
            server_name_filter=server_name_filter,
            clientid=mqtt_clientid,
            device_id=device_to_use
        )
        
        # 启动 MCP
        tg.start_soon(self.mcp_client.start)
        
        # 等待连接
        connected = await self.mcp_client.connect()
        if connected:
            logger.info(f"🔗 MCP connected with device_id: {device_to_use}")
            self.device_id = device_to_use
            
            # 等待工具加载
            max_wait_time = 10  # seconds
            wait_interval = 0.5  # seconds
            waited_time = 0
            
            while waited_time < max_wait_time:
                if self.mcp_client.mcp_tools:
                    logger.info(f"🔧 MCP tools loaded: {len(self.mcp_client.mcp_tools)} tools found")
                    
                    # Set MCP client for emotion control agent
                    self.emotion_agent.set_mcp_client(self.mcp_client)
                    
                    # Set MCP tools for voice response agent
                    self.voice_agent.set_mcp_tools(self.mcp_client.mcp_tools)
                    break
                    
                await anyio.sleep(wait_interval)
                waited_time += wait_interval
                logger.debug(f"⏳ Waiting for MCP tools... ({waited_time:.1f}s)")
            
            if not self.mcp_client.mcp_tools:
                logger.warning(f"⚠️ No MCP tools loaded after {max_wait_time}s timeout")
        else:
            logger.error("❌ Failed to connect MCP")

    async def message_to_device(self, message_type: str, payload: Any) -> bool:
        """Send message to device"""
        if not self.mcp_client or not self.device_id:
            return False
        
        topic = f"$message/{self.device_id}"
        message = json.dumps({
            "type": message_type,
            "payload": payload
        })
        
        return await self.mcp_client.publish_message(topic, message)

    async def stream_chat(self, user_input: str) -> AsyncGenerator[AgentResponse, None]:
        """Streaming conversation - parallel processing of voice responses and tool calls"""
        try:
            start_time = time.time()
            logger.info(f"💬 NEW CHAT START: '{user_input}'")
            
            await self.message_to_device("message", {"type": "loading", "status": "processing"})
            
            # 并行处理
            async for response in self._parallel_processing(user_input, start_time):
                yield response
                    
            # 完成处理
            total_time = time.time() - start_time
            logger.info(f"🏁 NEW CHAT COMPLETE: {total_time:.3f}s total")
            
            await self.message_to_device("message", {"type": "loading", "status": "complete"})
            yield AgentResponse(type=ResponseType.STREAM_END)
            
        except Exception as e:
            error_time = time.time()
            logger.error(f"❌ NEW CHAT ERROR: {error_time - start_time:.3f}s | {e}")
            yield AgentResponse(
                type=ResponseType.ERROR,
                content=str(e)
            )

    async def _parallel_processing(self, user_input: str, start_time: float) -> AsyncGenerator[AgentResponse, None]:
        """Simplified parallel processing"""
        logger.info("🔄 Starting simple parallel processing")
        
        # 真正的并行处理：工具调用在后台运行，语音流式输出
        async with anyio.create_task_group() as tg:
            # 启动工具调用任务（后台运行）
            async def tool_task():
                try:
                    result = await self.emotion_agent.determine_and_call_tools(user_input, "")
                    if result:
                        logger.info(f"🔧 Tool completed: {result}")
                except Exception as e:
                    logger.error(f"🔧 Tool error: {e}")
            
            # 启动工具调用任务
            tg.start_soon(tool_task)
            
            # 同时流式输出语音响应（不阻塞工具调用）
            async for chunk in self.voice_agent.generate_response_stream(user_input):
                yield AgentResponse(
                    type=ResponseType.STREAM_CHUNK,
                    content=chunk
                )


    def clear_history(self):
        """Clear conversation history"""
        logger.info("🧹 Clearing conversation history")
        self.voice_agent.clear_history()


    def get_stats(self) -> dict:
        """Get conversation statistics"""
        voice_stats = self.voice_agent.get_stats()
        
        return {
            "agent_type": "New Conversation Agent",
            "device_id": self.device_id,
            "mcp_connected": self.mcp_client is not None,
            "mcp_tools_count": len(self.emotion_agent.mcp_tools) if self.emotion_agent.mcp_tools else 0,
            **voice_stats
        }


    async def shutdown(self):
        """Shutdown agent and connections"""
        logger.info("🛑 Shutting down New Conversation Agent")
        if self.mcp_client:
            await self.mcp_client.stop()
