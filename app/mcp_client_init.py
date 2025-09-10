from contextlib import AsyncExitStack
from datetime import timedelta

import traceback
import logging
import re
from typing import List, cast, Any
import anyio
from llama_index.core.tools import BaseTool, FunctionTool
from mcp.client.mqtt import InitializeResult, MqttTransportClient
from mcp.shared.mqtt import MqttOptions
from pydantic import BaseModel
from pydantic import Field, create_model
import mcp.types as types

logger = logging.getLogger(__name__)

class McpServer(BaseModel):
    server_name: str
    success: bool

class McpMqttClient:
    def __init__(self, mqtt_options: MqttOptions, client_name: str, server_name_filter: str, read_timeout: int = 10, clientid: str | None = None, device_id: str | None = None, on_tools_updated=None):
        self._mqtt_client = None
        self.clientid = clientid
        self.device_id = device_id  # Store device ID
        self.mqtt_options = mqtt_options
        self.read_timeout = read_timeout
        self.client_name = client_name
        self.server_name_filter = server_name_filter
        self.mcp_servers: list[McpServer] = []
        self.mcp_tools: list[BaseTool] = []
        self._stop_event = anyio.Event()
        self._connected_event = anyio.Event()
        self.on_tools_updated = on_tools_updated  # Tools update callback

    def is_connected(self) -> bool:
        return self._mqtt_client.is_connected() if self._mqtt_client else False

    async def start(self):
        logger.info("MCP MQTT Client running ...")
        self._exit_stack = AsyncExitStack()
        self._mqtt_client = await self._exit_stack.enter_async_context(
            MqttTransportClient(
                mcp_client_name=self.client_name,
                client_id=self.clientid,
                server_name_filter=self.server_name_filter,
                auto_connect_to_mcp_server=True,
                on_mcp_server_discovered=self.on_mcp_server_discovered,
                on_mcp_connect=self.on_mcp_connect,
                on_mcp_disconnect=self.on_mcp_disconnect,
                mqtt_options=self.mqtt_options,
            )
        )
        self._connected_event.set()
        await self._stop_event.wait()
        logger.info("MCP MQTT Client termniated.")
        await self._exit_stack.aclose()

    async def stop(self):
        self._stop_event.set()

    async def publish_message(self, topic: str, message: str) -> bool:
        """Publish a message to specified MQTT topic"""
        if not self._mqtt_client:
            logger.error("MQTT client not connected")
            return False

        if hasattr(self._mqtt_client, 'client'):
            mqtt_client = self._mqtt_client.client
            result = mqtt_client.publish(topic, message, qos=0)
            if result.rc != 0:
                logger.error(f"Publish failed with rc: {result.rc}")
            return result.rc == 0
        else:
            logger.error("Cannot access internal MQTT client (client attribute not found)")
        return False

    async def connect(self) -> bool | str:
        await self._connected_event.wait()
        if self._mqtt_client:
            return await self._mqtt_client.start(timeout=timedelta(seconds=3))
        else:
            return False

    def get_mcp_servers(self):
        return self.mcp_servers

    def get_alive_mcp_servers(self):
        return [server for server in self.mcp_servers if server.success]

    def get_session(self, server_name: str):
        if self._mqtt_client:
            return self._mqtt_client.get_session(server_name)

    async def initialize_mcp_server(self, server_name) -> InitializeResult | None:
        if self._mqtt_client:
            return await self._mqtt_client.initialize_mcp_server(server_name, read_timeout_seconds=timedelta(seconds=self.read_timeout))
        else:
            return None

    async def on_mcp_server_discovered(self, client, server_name):
        logger.info(f"Discovered MCP server name: {server_name}")
        self.mcp_servers.append(McpServer(server_name=server_name, success=False))

    async def on_mcp_disconnect(self, client, server_name):
        logger.info(f"Disconnected from MCP server name: {server_name}")
        self.mcp_tools = []
        self.mcp_servers = [server for server in self.mcp_servers if server.server_name != server_name]

    async def on_mcp_connect(self, client, server_name, connect_result):
        success, _init_result = connect_result
        logger.info(f"Connect to MCP server name: {server_name}, result: {success}")
        if success == "ok":
            await self.load_mcp_tools(server_name)
        for server in self.mcp_servers:
            if server.server_name == server_name:
                server.success = success == "ok"
                break
        else:
            self.mcp_servers.append(McpServer(server_name=server_name, success=success))

    async def load_mcp_tools(self, server_name: str):
        logger.info(f"Loading MCP tools from server: {server_name}")
        try:
            ## note that we only support 1 MCP server now
            self.mcp_tools = await self._get_mcp_tools(server_name)
            logger.info(f"loaded tools: {[tool.metadata.name for tool in self.mcp_tools]}")

            # Notify tools updated callback
            if self.on_tools_updated:
                self.on_tools_updated()

        except Exception:
            logger.error(f"load tool error: {traceback.format_exc()}")

    async def _get_mcp_tools(self, server_name) -> List[FunctionTool]:
        client_session = self.get_session(server_name)
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
                                print(f"[MCP Tool Call] {tool_name} with args: {kwargs}")

                                result = await client_ref.call_tool(
                                    tool_name, kwargs
                                )
                                if result is False:
                                    print(f"[MCP Tool Failed] {tool_name} returned False")
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
                                        print(f"[MCP Tool Error] {tool_name}: {result_text}")
                                        return f"tool return error: {result_text}"
                                    else:
                                        print(f"[MCP Tool Success] {tool_name}: {result_text}")
                                        return result_text
                                else:
                                    print(f"[MCP Tool Success] {tool_name}: {str(call_result)}")
                                    return str(call_result)

                            except Exception as e:
                                logger.error(f"call tool error, tool_name: {tool_name}, stack: {traceback.format_exc()}")
                                return f"call tool {tool_name} error: {str(e)}"

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
