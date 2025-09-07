import anyio
import logging
import os
from typing import Any
import traceback
from pathlib import Path
from colorama import Fore, Style, init

from llama_index.core.agent.workflow import (
    AgentOutput,
    AgentStream,
    AgentWorkflow,
    ToolCallResult,
)

from llama_index.core.workflow import (
    Context,
    Event,
    StartEvent,
    StopEvent,
    Workflow,
    step,
)

from mcp_client_init import McpMqttClient
from mcp.shared.mqtt import MqttOptions
from mcp.shared.mqtt import configure_logging

from llama_index.core.llms import ChatMessage, MessageRole
from llama_index.core.tools import FunctionTool
from llama_index.core.settings import Settings
from llama_index.core.memory import ChatMemoryBuffer
from llama_index.llms.openai_like import OpenAILike
from tools import (
    process_tool_output,
    explain_photo,
    explain_photo_async,
    get_first_text_from_tool_output,
    api_key
)

configure_logging(level="DEBUG")
logger = logging.getLogger(__name__)

# Initialize colorama for colored output
init(autoreset=True)

client = None

mqtt_clientid=os.getenv("MQTT_CLIENT_ID") or f"mcp_ai_companion_demo_{os.getpid()}"
mqtt_options = MqttOptions(
    host=os.getenv("MQTT_BROKER_HOST") or "localhost",
    port=int(os.getenv("MQTT_BROKER_PORT") or 1883),
    username=None,
    password=None,
)


class FuncCallEvent(Event):
    tool_name: str
    tool_kwargs: dict[str, Any]
    tool_output: str | None


class MessageEvent(Event):
    message: str
    is_chunk: bool = False  # 标记是否为流式片段


class ConversationalAgent(Workflow):
    def __init__(self, mcp_client: McpMqttClient | None = None):
        super().__init__()

        self.mcp_client = mcp_client

        self.memory = ChatMemoryBuffer.from_defaults(token_limit=20000)
        self.llm = OpenAILike(
            model="deepseek-v3",
            api_key=api_key,
            api_base="https://dashscope.aliyuncs.com/compatible-mode/v1",
            is_chat_model=True,
            is_function_calling_model=True,
            temperature=0.6,
            max_tokens=60000,
            timeout=60,
        )
        Settings.llm = self.llm

        self.tools = [
            FunctionTool.from_defaults(
                fn=explain_photo,
                name="explain_photo",
                description=(
                    "Explain the photo by the question. Used when users ask a question about the photo. "
                    "The image_url is the url of the image."
                ),
                async_fn=explain_photo_async,
            ),
        ]

        self.conversation_history = []

        self.max_history_length = 20

        # Load system prompt from txt file
        prompt_file = Path(__file__).parent / "prompts" / "conversational_system_prompt.txt"
        with open(prompt_file, "r", encoding="utf-8") as f:
            self.system_prompt = f.read().strip()

    def _build_chat_messages(self, new_message: str) -> list:
        """Build structured chat message array"""
        return [
            ChatMessage(role=MessageRole.SYSTEM, content=self.system_prompt),
            ChatMessage(role=MessageRole.USER, content=new_message)
        ]

    def _emit_func_call_event(
        self, ctx: Context, name: str, args: dict[str, Any], result: str | None = None
    ) -> None:
        """Helper method to emit FuncCallEvent consistently across methods."""
        func_call_event = FuncCallEvent(
            tool_name=name, tool_kwargs=args, tool_output=result
        )
        ctx.write_event_to_stream(func_call_event)

    async def message_to_device(self, message_type: str, payload: Any) -> bool:
        """Send a message to device via MQTT"""
        if not self.mcp_client or not self.mcp_client.device_id:
            logger.debug("MCP client not initialized or no device_id")
            return False

        import json
        topic = f"$message/{self.mcp_client.device_id}"
        message = json.dumps({
            "type": message_type,
            "payload": payload
        })

        success = await self.mcp_client.publish_message(topic, message)
        if success:
            logger.info(f"{Fore.GREEN}Sent {message_type} to device{Style.RESET_ALL}")
        else:
            logger.error(f"{Fore.RED}Failed to send {message_type} to device{Style.RESET_ALL}")
        return success

    @step
    async def chat(self, ctx: Context, ev: StartEvent) -> StopEvent:
        try:
            tools = self.tools + self.mcp_client.mcp_tools if self.mcp_client else self.tools
            logger.info(f"Calling AgentWorkflow with tools: {[tool.metadata.name for tool in tools]}")
            query_info = AgentWorkflow.from_tools_or_functions(
                tools_or_functions=tools,
                llm=self.llm,
                system_prompt=self.system_prompt,
                verbose=False,
                timeout=30,
            )

            # Step 1: Starting to process user request
            logger.info(f"{Fore.GREEN}[1/3] Loading... Starting to process user request{Style.RESET_ALL}")
            await self.message_to_device("message", {"type": "loading", "status": "processing"})

            message = self._build_chat_messages(ev.user_input)

            # Step 2: Calling AI API and waiting for response
            logger.info(f"{Fore.GREEN}[2/3] Loading... Waiting for AI API response{Style.RESET_ALL}")
            await self.message_to_device("message", {"type": "loading", "status": "waiting"})

            handler = query_info.run(chat_history=message, stream=True)

            accumulated_response = ""
            first_chunk_received = False

            async for event in handler.stream_events():
                if isinstance(event, AgentStream):
                    # Handle streaming chunks
                    if hasattr(event, 'delta') and event.delta:
                        chunk = event.delta

                        # Step 3: Log when first chunk is received
                        if not first_chunk_received:
                            logger.info(f"{Fore.GREEN}[3/3] Loading complete! First response received{Style.RESET_ALL}")
                            await self.message_to_device("message", {"type": "loading", "status": "complete"})
                            first_chunk_received = True

                        accumulated_response += chunk
                        ctx.write_event_to_stream(MessageEvent(message=chunk, is_chunk=True))
                        logger.debug(f"Stream chunk: {chunk}")
                elif isinstance(event, AgentOutput):
                    # Final complete response (fallback for non-streaming)
                    if not accumulated_response:
                        output = event.response
                        response = process_tool_output(output)
                        logger.info(f"Agent response: {response}")
                        ctx.write_event_to_stream(MessageEvent(message=response, is_chunk=False))
                elif isinstance(event, ToolCallResult):
                    text = get_first_text_from_tool_output(event.tool_output)
                    self._emit_func_call_event(
                        ctx, event.tool_name, event.tool_kwargs, text
                    )

            # Send stream end signal if we were streaming
            if accumulated_response:
                ctx.write_event_to_stream(MessageEvent(message="", is_chunk=True))  # End signal

            return StopEvent

        except Exception as e:
            error_msg = f"error: {e}"
            logger.error(error_msg)
            return StopEvent

    async def init_mcp(self, tg: anyio.abc.TaskGroup, server_name_filter: str = "#", device_id: str = None) -> None:
        mcp_client = McpMqttClient(
            mqtt_options=mqtt_options,
            client_name="ai_companion_demo",
            server_name_filter=server_name_filter,
            clientid=mqtt_clientid,
            device_id=device_id
        )
        tg.start_soon(mcp_client.start)
        await mcp_client.connect()
        self.mcp_client = mcp_client

def print_welcome():
    """Print welcome message"""
    print("input 'exit' or 'quit' exit")
    print("input 'tools' show available tools")
    print("=" * 50)


def should_exit(user_input: str) -> bool:
    """Check if user wants to exit"""
    return user_input.lower() in ["exit", "quit"]


def display_tools(agent):
    """Display available tools"""
    tools = agent.tools + agent.mcp_client.mcp_tools
    print(f"available tools: {len(tools)}")
    for tool in tools:
        tool_name = getattr(tool.metadata, "name", str(tool))
        tool_desc = getattr(tool.metadata, "description", "No description")
        print(f"- {tool_name}: {tool_desc}")


async def process_user_input(agent, user_input: str):
    """Process user input and run agent"""
    handler = agent.run(user_input=user_input)
    async for event in handler.stream_events():
        if hasattr(event, "message"):
            print(f"assistant: {event.message}")
        elif hasattr(event, "tool_output"):
            print(f"tool output: {event.tool_output}")


async def handle_single_input(agent, user_input: str) -> bool:
    """Handle a single user input, return True if should continue"""
    user_input = user_input.strip()

    if should_exit(user_input):
        return False

    if user_input.lower() == "tools":
        display_tools(agent)
        return True

    if not user_input:
        return True

    await process_user_input(agent, user_input)
    return True


async def input_loop(agent):
    """Main input loop for the agent"""
    while True:
        try:
            user_input = input("\nuser: ")
            should_continue = await handle_single_input(agent, user_input)
            if not should_continue:
                break
        except KeyboardInterrupt:
            break
        except Exception as e:
            error_msg = traceback.format_exc()
            print(f"error: {e}, traceback: {error_msg}")


async def main():
    try:
        async with anyio.create_task_group() as tg:
            agent = ConversationalAgent()
            # Initialize MCP client, it will auto-discover devices
            # Using "#" to accept all MCP servers
            # Fixed device_id for testing
            await agent.init_mcp(tg, server_name_filter="#", device_id="companion-001")
            print("MCP client initialized with device_id: companion-001")
            print_welcome()
            tg.start_soon(input_loop, agent)
    except Exception as e:
        print(f"agent init error: {e}")


if __name__ == "__main__":
    anyio.run(main)
