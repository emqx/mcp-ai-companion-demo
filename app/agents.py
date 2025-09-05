import anyio
import logging
import os
from typing import Any
import traceback
from pathlib import Path

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
            top_p=0.95,
            max_tokens=60000,
            timeout=60,
            stream_timeout=30,
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

            message = self._build_chat_messages(ev.user_input)
            handler = query_info.run(chat_history=message, stream=True)

            accumulated_response = ""
            async for event in handler.stream_events():
                if isinstance(event, AgentStream):
                    # Handle streaming chunks
                    if hasattr(event, 'delta') and event.delta:
                        chunk = event.delta
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

    async def init_mcp(self, tg: anyio.abc.TaskGroup, server_name_filter: str = "#") -> None:
        mcp_client = McpMqttClient(
            mqtt_options=mqtt_options,
            client_name=f"ai_companion_demo",
            server_name_filter=server_name_filter,
            clientid=mqtt_clientid
        )
        tg.start_soon(mcp_client.start)
        await mcp_client.connect()
        self.mcp_client = mcp_client

async def main():
    try:
        tg = anyio.create_task_group()
        await tg.__aenter__()
        agent = ConversationalAgent()
        print("input 'exit' or 'quit' exit")
        print("input 'tools' show available tools")
        print("=" * 50)
        async def get_input(self):
            while True:
                try:
                    user_input = input("\nuser: ")
                    user_input = user_input.strip()
                    if user_input.lower() in ["exit", "quit"]:
                        break

                    if user_input.lower() == "tools":
                        tools = agent.tools + agent.mcp_client.mcp_tools
                        print(f"available tools: {len(tools)}")
                        for tool in tools:
                            tool_name = getattr(tool.metadata, "name", str(tool))
                            tool_desc = getattr(
                                tool.metadata, "description", "No description"
                            )
                            print(f"- {tool_name}: {tool_desc}")
                        continue

                    if not user_input:
                        continue
                    handler = agent.run(user_input=user_input)
                    async for event in handler.stream_events():
                        if hasattr(event, "message"):
                            print(f"assistant: {event.message}")
                        elif hasattr(event, "tool_output"):
                            print(f"tool output: {event.tool_output}")

                except KeyboardInterrupt:
                    break
                except Exception as e:
                    error_msg = traceback.format_exc()
                    print(f"error: {e}, traceback: {error_msg}")
        tg.start_soon(get_input, None)
        #wait for the input task to complete
        await tg.__aexit__(None, None, None)

    except Exception as e:
        print(f"agent init error: {e}")


if __name__ == "__main__":
    anyio.run(main)
