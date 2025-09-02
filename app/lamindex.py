import anyio
import logging
import re
import os
from typing import List, Optional, Union, cast, Any
from dataclasses import dataclass

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
import mcp.types as types

from llama_index.llms.siliconflow import SiliconFlow
from llama_index.core.llms import ChatMessage, MessageRole
from llama_index.core.tools import BaseTool, FunctionTool
from llama_index.core.settings import Settings
from llama_index.llms.openai_like import OpenAILike
from pydantic import Field, create_model
from llama_index.core.tools import ToolOutput
from openai import OpenAI

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

import os

api_key = os.environ.get("DASHSCOPE_API_KEY")


def build_fn_schema_from_input_schema(model_name: str, input_schema: dict):
    """Build a Pydantic model from JSON Schema's properties/required so params are top-level.

    We relax nested types to Any. Required controls whether a field is required.
    """
    props = (input_schema or {}).get("properties", {}) or {}
    required = set((input_schema or {}).get("required", []) or [])

    fields = {}
    for key, prop in props.items():
        desc = prop.get("description") if isinstance(prop, dict) else None
        default = ... if key in required else None
        fields[key] = (Any, Field(default=default, description=desc))

    class_name = re.sub(r"\W+", "_", f"{model_name}Params")
    return create_model(class_name, **fields)

async def get_mcp_tools(mcp_client: McpMqttClient) -> List[BaseTool]:
    alive_mcp_servers = mcp_client.get_alive_mcp_servers()
    if len(alive_mcp_servers) == 0:
        return []
    first_mcp_server_name = alive_mcp_servers[0].server_name
    client_session = mcp_client.get_session(first_mcp_server_name)
    all_tools = []
    try:
        try:
            tools_result = await client_session.list_tools()

            if tools_result is False:
                return all_tools

            list_tools_result = cast(types.ListToolsResult, tools_result)
            tools = list_tools_result.tools

            for tool in tools:
                logger.info(f"tool: {tool.name} - {tool.description}")

                def create_mcp_tool_wrapper(client_ref, tool_name):
                    async def mcp_tool_wrapper(**kwargs):
                        try:
                            result = await client_ref.call_tool(
                                tool_name, kwargs
                            )
                            if result is False:
                                return f"call {tool_name} failed"

                            call_result = cast(types.CallToolResult, result)

                            if hasattr(call_result, "content") and call_result.content:
                                content_parts = []
                                for content_item in call_result.content:
                                    if hasattr(content_item, "type"):
                                        if content_item.type == "text":
                                            text_content = cast(
                                                types.TextContent, content_item
                                            )
                                            content_parts.append(text_content.text)
                                        elif content_item.type == "image":
                                            image_content = cast(
                                                types.ImageContent, content_item
                                            )
                                            content_parts.append(
                                                f"[image: {image_content.mimeType}]"
                                            )
                                        elif content_item.type == "resource":
                                            resource_content = cast(
                                                types.EmbeddedResource, content_item
                                            )
                                            content_parts.append(
                                                f"[resource: {resource_content.resource}]"
                                            )
                                        else:
                                            content_parts.append(str(content_item))
                                    else:
                                        content_parts.append(str(content_item))

                                result_text = "\n".join(content_parts)

                                if (
                                    hasattr(call_result, "isError")
                                    and call_result.isError
                                ):
                                    return f"tool return error: {result_text}"
                                else:
                                    return result_text
                            else:
                                return str(call_result)

                        except Exception as e:
                            error_msg = f"call {tool_name} error: {e}"
                            logger.error(error_msg)
                            return error_msg

                    return mcp_tool_wrapper

                wrapper_func = create_mcp_tool_wrapper(
                    client_session, tool.name
                )

                try:
                    input_schema = getattr(tool, "inputSchema", {}) or {}
                    fn_schema = build_fn_schema_from_input_schema(
                        tool.name, input_schema
                    )
                    llamaindex_tool = FunctionTool.from_defaults(
                        fn=wrapper_func,
                        name=f"{tool.name}",
                        description=tool.description or f"MCP tool: {tool.name}",
                        async_fn=wrapper_func,
                        fn_schema=fn_schema,
                    )
                    all_tools.append(llamaindex_tool)
                    # logger.info(f"call tool success: mcp_{tool.name}")

                except Exception as e:
                    logger.error(f"create tool {tool.name} error: {e}")

        except Exception as e:
            logger.error(f"Get tool list error: {e}")

    except Exception as e:
        logger.error(f"Get tool list error: {e}")

    return all_tools


def process_tool_output(response_text):
    if hasattr(response_text, "content"):
        response_text = response_text.content
        return response_text
    return None


def explain_photo(image_url: str, question: str) -> str:
    """Explain the photo by the question. Used when users ask a question about the photo. The image_url is the url of the image."""

    request_body = {
        "role": "user",
        "content": [
            {
                "type": "image_url",
                "image_url": {"url": image_url},
            },
            {"type": "text", "text": question},
        ],
    }

    client = OpenAI(
        api_key=api_key,
        base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
    )
    completion = client.chat.completions.create(
        model="qwen-vl-plus",
        messages=[request_body],
    )
    # 提取第一个 choice 的 message.content 字段
    content = ""
    if completion.choices and hasattr(completion.choices[0], "message"):
        content = completion.choices[0].message.content
    return content


async def explain_photo_async(image_url: str, question: str) -> str:
    """Explain the photo by the question asynchronously. Used when users ask a question about the photo. The image_url is the url of the image."""
    return explain_photo(image_url, question)


def get_first_text_from_tool_output(tool_output: ToolOutput) -> str:
    if tool_output is None or not hasattr(tool_output, "content"):
        return ""
    if hasattr(tool_output, "raw_output") and hasattr(
        tool_output.raw_output, "content"
    ):
        content = tool_output.raw_output.content
        if isinstance(content, list):
            for item in content:
                if hasattr(item, "type") and hasattr(item, "text"):
                    return item.text
    return ""


class FuncCallEvent(Event):
    tool_name: str
    tool_kwargs: dict[str, Any]
    tool_output: str | None


class MessageEvent(Event):
    message: str


class ConversationalAgent(Workflow):
    def __init__(self, mcp_client: McpMqttClient | None = None):
        super().__init__()

        self.mcp_client = mcp_client
        self.llm = OpenAILike(
            model="deepseek-v3",
            api_key=api_key,
            api_base="https://dashscope.aliyuncs.com/compatible-mode/v1",
            is_chat_model=True,
            is_function_calling_model=True,
            temperature=0,
            max_tokens=60000,
            timeout=600,  # 整体超时时间
            stream_timeout=300,  # 流式响应单项超时
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

        # self.agent = AgentRunner.from_llm(llm=self.llm, tools=self.tools, verbose=True)

        self.conversation_history = []

        self.max_history_length = 20

        self.system_prompt = """
                在这个对话中，你将扮演一个情感宠物机器人。你需要与主人互动，回答主人问题，安慰主人心情。
                你可以调用拍照工具 take_photo，然后调用图片解释工具 explain_photo，这样你就能知道面前主人的文字状态描述。
                因此当主人问到与视觉相关的互动问题时，你可以用以上方法获得主人的状态，进而根据主人状态回复。比如
                * 看看我今天的发型怎么样？
                * 你看这是什么饮料？

                根据主人提供的问题，生成一个富有温度的回应。注意少于 80 个字。
                """

    def _build_chat_messages(self, new_message: str) -> list:
        """Build structured chat message array"""
        messages = []

        # Add system prompt
        messages.append(
            ChatMessage(
                role=MessageRole.SYSTEM,
                content=self.system_prompt,
                additional_kwargs={},
            )
        )

        # Add conversation history (keep recent N rounds of conversation)
        recent_history = (
            self.conversation_history[-self.max_history_length :]
            if len(self.conversation_history) > self.max_history_length
            else self.conversation_history
        )

        # Clean history messages, completely remove tool_calls field and filter empty messages
        for i, msg in enumerate(recent_history):
            # Ensure content is valid (not None and not empty string)
            content = msg.content or ""

            if not content.strip():  # Skip empty messages
                continue

            # Use model_construct to create cleanest messages
            clean_msg = ChatMessage.model_construct(
                role=msg.role,
                content=content,
                additional_kwargs={},
                blocks=[],  # Ensure no extra block data
            )
            messages.append(clean_msg)

        # Add current user message
        messages.append(
            ChatMessage(
                role=MessageRole.USER, content=new_message, additional_kwargs={}
            )
        )

        # Final cleanup: ensure all messages have valid content
        final_messages = []
        for msg in messages:
            # Check if content is valid
            content = msg.content
            if content is None or not str(content).strip():
                continue  # Skip invalid messages
            else:
                # Add messages with valid content directly
                final_messages.append(msg)

        return final_messages

    async def load_mcp_tools(self):
        print("Loading MCP tools...")
        if self.mcp_client:
            try:
                mcp_tools = await get_mcp_tools(self.mcp_client)
                print(f"Found tools: {mcp_tools}")
                if mcp_tools:
                    self.tools.extend(mcp_tools)
                    ## remove duplicate tools by name, keep the last one
                    unique_tools = {}
                    for tool in self.tools:
                        tool_name = getattr(tool.metadata, "name", str(tool))
                        unique_tools[tool_name] = tool
                    self.tools = list(unique_tools.values())
                    print(f"Total tools names now: {[getattr(tool.metadata, 'name', str(tool)) for tool in self.tools]}")

                    # self.agent = AgentRunner.from_llm(
                    #     llm=self.llm, tools=self.tools, verbose=True
                    # )
                    logger.info(f"load {len(mcp_tools)} tools")
            except Exception as e:
                logger.error(f"load tool error: {e}")

    # async def chat(self, message: str) -> str:
    #     try:
    #         if not self.mcp_tools_loaded:
    #             await self.load_mcp_tools()

    #         query_info = AgentWorkflow.from_tools_or_functions(
    #             tools_or_functions=self.tools,
    #             llm=self.llm,
    #             system_prompt=self.system_prompt,
    #             verbose=False,
    #             timeout=180,
    #         )

    #         message = self._build_chat_messages(message)
    #         handler = query_info.run(chat_history=message)

    #         output = None
    #         async for event in handler.stream_events():
    #             if isinstance(event, AgentOutput):
    #                 output = event.response
    #         response = process_tool_output(output)

    #         logger.info(f"Agent response: {response}")
    #         return str(response)

    #     except Exception as e:
    #         error_msg = f"error: {e}"
    #         logger.error(error_msg)
    #         return error_msg

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
            await self.load_mcp_tools()

            query_info = AgentWorkflow.from_tools_or_functions(
                tools_or_functions=self.tools,
                llm=self.llm,
                system_prompt=self.system_prompt,
                verbose=False,
                timeout=180,
            )

            message = self._build_chat_messages(ev.user_input)
            handler = query_info.run(chat_history=message)

            output = None
            async for event in handler.stream_events():
                if isinstance(event, AgentOutput):
                    output = event.response
                    response = process_tool_output(output)
                    logger.info(f"Agent response: {response}")
                    ctx.write_event_to_stream(MessageEvent(message=response))
                elif isinstance(event, ToolCallResult):
                    text = get_first_text_from_tool_output(event.tool_output)
                    self._emit_func_call_event(
                        ctx, event.tool_name, event.tool_kwargs, text
                    )

            return StopEvent

        except Exception as e:
            error_msg = f"error: {e}"
            logger.error(error_msg)
            return StopEvent

async def init_mcp_and_agent(tg: anyio.abc.TaskGroup):
    mcp_client = McpMqttClient(
        mqtt_options=mqtt_options,
        client_name=f"ai_companion_demo",
        server_name_filter="#",
        clientid=mqtt_clientid
    )
    tg.start_soon(mcp_client.start)
    await mcp_client.connect()
    agent = ConversationalAgent(mcp_client=mcp_client)
    await agent.load_mcp_tools()
    return (agent, mcp_client)

async def main():
    try:
        tg = anyio.create_task_group()
        await tg.__aenter__()
        agent = await init_mcp_and_agent(tg)
        await anyio.sleep(2.0)
        ## aysnc load tools every 10 seconds
        # def load_tools_periodically():
        #     async def _load():
        #         while True:
        #             try:
        #                 await agent.load_mcp_tools()
        #             except Exception as e:
        #                 logger.error(f"periodically load tool error: {e}")
        #             await anyio.sleep(10.0)
        #     tg.start_soon(_load)
        #load_tools_periodically()

        print("input 'exit' or 'quit' exit")
        print("input 'tools' show available tools")
        print("=" * 50)
        async def get_input(self):
            while True:
                try:
                    user_input = await ainput("\nuser: ")
                    user_input = user_input.strip()
                    if user_input.lower() in ["exit", "quit"]:
                        break

                    if user_input.lower() == "tools":
                        print(f"available tools: {len(agent.tools)}")
                        for tool in agent.tools:
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
                    print(f"error: {e}")
        tg.start_soon(get_input, None)
        #wait for the input task to complete
        await tg.__aexit__(None, None, None)

    except Exception as e:
        print(f"agent init error: {e}")


if __name__ == "__main__":
    anyio.run(main)
