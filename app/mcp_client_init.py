import asyncio
import anyio
import logging
import re
from typing import List, Optional, Union, cast, Any
from dataclasses import dataclass

import mcp.client.mqtt as mcp_mqtt
from mcp.shared.mqtt import configure_logging
import mcp.types as types

from llama_index.core.tools import BaseTool, FunctionTool
from pydantic import Field, create_model

# 配置日志
configure_logging(level="DEBUG")
logger = logging.getLogger(__name__)


async def on_mcp_server_discovered(client: mcp_mqtt.MqttTransportClient, server_name):
    """MCP 服务器发现时的回调函数"""
    logger.info(f"Discovered {server_name}, connecting ...")
    await client.initialize_mcp_server(server_name)


async def on_mcp_connect(client, server_name, connect_result):
    """MCP 连接成功时的回调函数"""
    capabilities = client.get_session(server_name).server_info.capabilities
    logger.info(f"Capabilities of {server_name}: {capabilities}")

    if capabilities.prompts:
        prompts = await client.list_prompts(server_name)
        logger.info(f"Prompts of {server_name}: {prompts}")

    if capabilities.resources:
        resources = await client.list_resources(server_name)
        logger.info(f"Resources of {server_name}: {resources}")
        resource_templates = await client.list_resource_templates(server_name)
        logger.info(f"Resources templates of {server_name}: {resource_templates}")

    if capabilities.tools:
        toolsResult = await client.list_tools(server_name)
        tools = toolsResult.tools
        logger.info(f"Tools of {server_name}: {tools}")


async def on_mcp_disconnect(client, server_name):
    """MCP 断开连接时的回调函数"""
    logger.info(f"Disconnected from {server_name}")


def build_fn_schema_from_input_schema(model_name: str, input_schema: dict):
    """从 JSON Schema 构建 Pydantic 模型

    将嵌套类型放宽为 Any。required 控制字段是否必需。
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


async def get_mcp_tools(
    mcp_client: mcp_mqtt.MqttTransportClient, server_name: str = "ESP32 Demo Server"
) -> List[BaseTool]:
    """获取 MCP 工具列表并转换为 LlamaIndex 工具格式"""
    all_tools = []
    try:
        try:
            tools_result = await mcp_client.list_tools(server_name)

            if tools_result is False:
                return all_tools

            list_tools_result = cast(types.ListToolsResult, tools_result)
            tools = list_tools_result.tools

            for tool in tools:
                logger.info(f"tool: {tool.name} - {tool.description}")

                def create_mcp_tool_wrapper(client_ref, server_name, tool_name):
                    async def mcp_tool_wrapper(**kwargs):
                        try:
                            result = await client_ref.call_tool(
                                server_name, tool_name, kwargs
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
                    mcp_client, server_name, tool.name
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

                except Exception as e:
                    logger.error(f"create tool {tool.name} error: {e}")

        except Exception as e:
            logger.error(f"Get tool list error: {e}")

    except Exception as e:
        logger.error(f"Get tool list error: {e}")

    return all_tools


async def create_mcp_client(
    client_name: str = "test_client",
    host: str = "localhost",
    auto_connect_to_mcp_server: bool = True,
    on_mcp_server_discovered=None,
    on_mcp_connect=None,
    on_mcp_disconnect=None,
) -> mcp_mqtt.MqttTransportClient:
    """创建并配置 MCP 客户端

    Args:
        client_name: 客户端名称
        host: MQTT 服务器主机地址
        auto_connect_to_mcp_server: 是否自动连接到 MCP 服务器
        on_mcp_server_discovered: 服务器发现回调函数
        on_mcp_connect: 连接成功回调函数
        on_mcp_disconnect: 断开连接回调函数

    Returns:
        配置好的 MCP 客户端实例
    """
    # 使用默认回调函数如果没有提供
    if on_mcp_server_discovered is None:
        on_mcp_server_discovered = on_mcp_server_discovered
    if on_mcp_connect is None:
        on_mcp_connect = on_mcp_connect
    if on_mcp_disconnect is None:
        on_mcp_disconnect = on_mcp_disconnect

    mcp_client = mcp_mqtt.MqttTransportClient(
        client_name,
        auto_connect_to_mcp_server=auto_connect_to_mcp_server,
        on_mcp_server_discovered=on_mcp_server_discovered,
        on_mcp_connect=on_mcp_connect,
        on_mcp_disconnect=on_mcp_disconnect,
        mqtt_options=mcp_mqtt.MqttOptions(
            host=host,
        ),
    )

    return mcp_client


async def initialize_mcp_client(
    client_name: str = "test_client", host: str = "localhost", wait_time: float = 3.0
) -> mcp_mqtt.MqttTransportClient:
    """初始化 MCP 客户端并等待连接建立

    Args:
        client_name: 客户端名称
        host: MQTT 服务器主机地址
        wait_time: 等待连接建立的时间（秒）

    Returns:
        已启动的 MCP 客户端实例
    """
    mcp_client = await create_mcp_client(client_name, host)

    try:
        await mcp_client.start()
        await anyio.sleep(wait_time)
        logger.info(f"MCP client '{client_name}' initialized successfully")
        return mcp_client
    except Exception as e:
        logger.error(f"Failed to initialize MCP client: {e}")
        raise


# 使用示例
async def example_usage():
    """使用示例"""
    try:
        # 创建并初始化 MCP 客户端
        mcp_client = await initialize_mcp_client(
            client_name="example_client", host="localhost", wait_time=3.0
        )

        # 获取工具列表
        tools = await get_mcp_tools(mcp_client)
        logger.info(f"Found {len(tools)} MCP tools")

        # 使用完毕后关闭客户端
        await mcp_client.stop()

    except Exception as e:
        logger.error(f"Example usage error: {e}")


if __name__ == "__main__":
    # 运行示例
    anyio.run(example_usage)
