import re
import traceback
from contextlib import AsyncExitStack
from datetime import timedelta
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple, Awaitable, cast

import anyio
from llama_index.core.tools import BaseTool, FunctionTool
from mcp.client.mqtt import InitializeResult, MqttClientSession, MqttTransportClient
from mcp.shared.mqtt import MqttOptions
import mcp.shared.mqtt_topic as mqtt_topic
from pydantic import BaseModel
from pydantic import Field, create_model
import mcp.types as types
from utils.colored_logger import get_agent_logger

logger = get_agent_logger("mcp_mqtt")


class McpServer(BaseModel):
    server_name: str
    success: bool


def _tool_signature(tools: Sequence[BaseTool]) -> Tuple[str, ...]:
    names: List[str] = []
    for tool in tools:
        metadata = getattr(tool, "metadata", None)
        if metadata and hasattr(metadata, "name"):
            names.append(str(metadata.name))
        else:
            names.append(str(tool))
    return tuple(names)


class McpMqttClient:
    def __init__(
        self,
        mqtt_options: MqttOptions,
        client_name: str,
        server_name_filter: str,
        read_timeout: int = 10,
        clientid: str | None = None,
        device_id: str | None = None,
        on_tools_updated: Optional[Callable[[str, Sequence[BaseTool]], None]] = None,
        on_server_status: Optional[Callable[[str, str], None]] = None,
    ):
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
        self.on_server_status = on_server_status
        self._session_events: dict[str, anyio.Event] = {}
        self._server_events: dict[str, anyio.Event] = {}
        self._reinit_locks: dict[str, anyio.Lock] = {}  # Add reinitialization locks
        self._tools_by_server: Dict[str, List[BaseTool]] = {}

    async def _teardown_session(self, server_name: str) -> None:
        """Tear down any existing session."""
        if not self._mqtt_client:
            return

        client_sessions = getattr(self._mqtt_client, "client_sessions", {})
        if server_name in client_sessions:
            try:
                await self._mqtt_client.deinitialize_mcp_server(server_name)
            except KeyError:
                logger.debug("Skipped teardown; server not tracked: %s", server_name)
            except Exception as exc:
                logger.debug("Teardown failed for server %s: %s", server_name, exc)

        self._session_events[server_name] = anyio.Event()
        self._server_events[server_name] = anyio.Event()

    def _refresh_presence_subscription(self, server_name: str) -> None:
        """Re-subscribe to presence for the given server to fetch retained status."""
        if not self._mqtt_client:
            return
        try:
            topic = mqtt_topic.get_server_presence_topic("+", server_name)
            self._mqtt_client.client.subscribe(topic, qos=0)
            logger.debug("Refreshed presence subscription: %s", topic)
        except Exception as exc:
            logger.warning("Failed to refresh presence subscription for %s: %s", server_name, exc)

    def is_connected(self) -> bool:
        return self._mqtt_client.is_connected() if self._mqtt_client else False

    async def start(self):
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
        logger.debug(
            "MCP MQTT transport started (filter=%s, client_id=%s)",
            self.server_name_filter,
            self.clientid or "<auto>",
        )
        await self._stop_event.wait()
        await self._exit_stack.aclose()
        logger.info("MCP MQTT transport stopped")

    async def stop(self):
        self._stop_event.set()

    async def publish_message(self, topic: str, message: str) -> bool:
        """Publish a message to specified MQTT topic"""
        if not self._mqtt_client:
            logger.debug("Publish skipped; MQTT client not connected (topic=%s)", topic)
            return False

        if hasattr(self._mqtt_client, 'client'):
            mqtt_client = self._mqtt_client.client
            result = mqtt_client.publish(topic, message, qos=0)
            if result.rc != 0:
                logger.warning("Publish failed rc=%s topic=%s", result.rc, topic)
                return False
            logger.debug("Publish success topic=%s", topic)
            return True
        else:
            logger.debug("Publish skipped; missing underlying mqtt client attribute")
        return False

    async def connect(self) -> bool | str:
        await self._connected_event.wait()
        if self._mqtt_client:
            logger.debug(
                "Connecting to MQTT broker %s:%s (client=%s, filter=%s)",
                self.mqtt_options.host,
                self.mqtt_options.port,
                self.clientid or "<auto>",
                self.server_name_filter,
            )
            result = await self._mqtt_client.start(timeout=timedelta(seconds=3))
            if result is False or (isinstance(result, tuple) and result[0] == "error"):
                logger.error("Failed to connect MCP MQTT transport: %s", result)
            else:
                logger.info("MQTT broker connection established")
            return result
        else:
            return False

    def get_mcp_servers(self):
        return self.mcp_servers

    def get_alive_mcp_servers(self):
        return [server for server in self.mcp_servers if server.success]

    def get_session(self, server_name: str):
        if self._mqtt_client:
            return self._mqtt_client.get_session(server_name)

    def get_tools_for_server(self, server_name: str) -> List[BaseTool]:
        return self._tools_by_server.get(server_name, [])

    def list_servers_with_tools(self) -> List[str]:
        return [name for name, tools in self._tools_by_server.items() if tools]

    async def initialize_mcp_server(self, server_name) -> InitializeResult | None:
        if self._mqtt_client:
            return await self._mqtt_client.initialize_mcp_server(server_name, read_timeout_seconds=timedelta(seconds=self.read_timeout))
        else:
            return None

    def _notify_tools_updated(self, server_name: str, tools: Sequence[BaseTool]) -> None:
        if not self.on_tools_updated:
            return
        try:
            self.on_tools_updated(server_name, list(tools))
        except TypeError:
            # Backwards compatibility with callbacks that take no args
            self.on_tools_updated()

    def _notify_server_status(self, server_name: str, status: str) -> None:
        if self.on_server_status:
            try:
                self.on_server_status(server_name, status)
            except Exception as exc:  # pragma: no cover - defensive logging
                logger.warning("server status callback failed for %s: %s", server_name, exc)

    async def on_mcp_server_discovered(self, client, server_name):
        if not any(s.server_name == server_name for s in self.mcp_servers):
            self.mcp_servers.append(McpServer(server_name=server_name, success=False))
        logger.debug("MCP server discovered: %s", server_name)
        event = self._server_events.get(server_name)
        if event is None:
            event = anyio.Event()
            self._server_events[server_name] = event
        event.set()

    async def on_mcp_disconnect(self, client, server_name):
        self.mcp_tools = []
        self._tools_by_server.pop(server_name, None)
        self._notify_tools_updated(server_name, [])
        self.mcp_servers = [server for server in self.mcp_servers if server.server_name != server_name]
        # Reset readiness event so future waits block until reconnection
        self._session_events[server_name] = anyio.Event()
        self._server_events[server_name] = anyio.Event()
        self._notify_server_status(server_name, "offline")
        remaining = [s.server_name for s in self.mcp_servers]
        logger.info("MCP server offline: %s (remaining=%s)", server_name, remaining or "none")

    async def on_mcp_connect(self, client, server_name, connect_result):
        success, _init_result = connect_result
        if success == "ok":
            logger.info("MCP server online: %s", server_name)
            await self.load_mcp_tools(server_name)
            if server_name not in self._session_events:
                self._session_events[server_name] = anyio.Event()
            self._session_events[server_name].set()
            if server_name not in self._server_events:
                self._server_events[server_name] = anyio.Event()
            self._server_events[server_name].set()
            self._notify_server_status(server_name, "online")
        else:
            logger.warning("MCP server connection failed (%s): %s", server_name, success)
        for server in self.mcp_servers:
            if server.server_name == server_name:
                server.success = success == "ok"
                break
        else:
            self.mcp_servers.append(McpServer(server_name=server_name, success=success))

    async def _wait_for_session_ready(self, server_name: str, timeout: float = 3.0) -> bool:
        """Block until the specified server's session is marked ready or timeout occurs."""
        event = self._session_events.get(server_name)
        if event is None:
            event = anyio.Event()
            self._session_events[server_name] = event

        if event.is_set():
            return True

        with anyio.move_on_after(timeout):
            await event.wait()
            return True

        logger.warning("Timed out waiting for MCP session '%s' to become ready", server_name)
        return False

    async def _wait_for_server_online(self, server_name: str, timeout: float = 5.0) -> bool:
        """Ensure the server presence is observed before attempting to initialize."""
        event = self._server_events.get(server_name)
        if event is None:
            event = anyio.Event()
            self._server_events[server_name] = event

        if event.is_set():
            return True

        with anyio.move_on_after(timeout):
            await event.wait()
            return True

        logger.warning("Timed out waiting for MCP server '%s' to come online", server_name)
        return False

    async def load_mcp_tools(self, server_name: str):
        logger.info("Requesting tool catalog from MCP server: %s", server_name)
        try:
            tools = await self._get_mcp_tools(server_name)
            self._tools_by_server[server_name] = tools
            self.mcp_tools = tools
            tool_names = [
                tool.metadata.name
                for tool in tools
                if hasattr(tool, "metadata") and hasattr(tool.metadata, "name")
            ]
            if tool_names:
                logger.info(
                    "Registered %s tools from %s: %s",
                    len(tool_names),
                    server_name,
                    ", ".join(tool_names),
                )
            else:
                logger.warning("No tools reported by MCP server: %s", server_name)
            self._notify_tools_updated(server_name, tools)
        except Exception:
            self._tools_by_server[server_name] = []
            self._notify_tools_updated(server_name, [])
            logger.error("Failed to load tools from %s\n%s", server_name, traceback.format_exc())

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
                    logger.debug("tool discovered %s: %s", tool.name, tool.description)

                    def create_mcp_tool_wrapper(tool_name):
                        async def mcp_tool_wrapper(**kwargs):
                            async def _call_tool(session):
                                result = await session.call_tool(tool_name, kwargs)
                                if result is False:
                                    logger.warning("MCP tool '%s' returned False", tool_name)
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
                                        logger.error("MCP tool '%s' reported error: %s", tool_name, result_text)
                                        return f"tool return error: {result_text}"
                                    else:
                                        logger.info("MCP tool '%s' succeeded: %s", tool_name, result_text)
                                        return result_text
                                else:
                                    logger.info("MCP tool '%s' succeeded", tool_name)
                                    return str(call_result)

                            async def _execute_with_session(timeout: float = 3.0):
                                logger.info("Invoking MCP tool '%s' with args=%s", tool_name, kwargs)
                                lock = self._reinit_locks.setdefault(server_name, anyio.Lock())

                                async def ensure_session() -> MqttClientSession | str:
                                    session = self.get_session(server_name)
                                    if session is not None:
                                        return session

                                    self._refresh_presence_subscription(server_name)

                                    if not await self._wait_for_server_online(server_name, timeout=timeout):
                                        return f"failed to detect MCP server {server_name}"

                                    init_result = await self.initialize_mcp_server(server_name)
                                    if init_result is False or (
                                        isinstance(init_result, tuple) and init_result[0] == "error"
                                    ):
                                        return f"MCP session initialization failed for {server_name}"

                                    if not await self._wait_for_session_ready(server_name, timeout=timeout):
                                        return f"MCP session timeout for {server_name}"

                                    session = self.get_session(server_name)
                                    if session is None:
                                        return f"MCP session unavailable for {server_name}"

                                    return session

                                async with lock:
                                    session_or_error = await ensure_session()
                                    if isinstance(session_or_error, str):
                                        return session_or_error

                                    try:
                                        return await _call_tool(session_or_error)
                                    except anyio.ClosedResourceError:
                                        logger.warning(
                                            "MCP session write stream closed for %s during tool call",
                                            server_name,
                                        )
                                        await self._teardown_session(server_name)

                                        session_or_error = await ensure_session()
                                        if isinstance(session_or_error, str):
                                            return session_or_error

                                        return await _call_tool(session_or_error)

                            try:
                                session_timeout = max(float(self.read_timeout), 3.0)
                                return await _execute_with_session(timeout=session_timeout)
                            except Exception as e:
                                logger.error(
                                    f"call tool error, tool_name: {tool_name}, stack: {traceback.format_exc()}"
                                )
                                return f"call tool {tool_name} error: {str(e)}"

                        return mcp_tool_wrapper

                    wrapper_func = create_mcp_tool_wrapper(tool.name)

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


class McpServerRegistry:
    """Maintain shared MCP MQTT client and per-server tool registry."""

    def __init__(
        self,
        *,
        mqtt_options: MqttOptions,
        client_name: str = "ai_companion_registry",
        server_name_prefix: str = "web-ui-hardware-controller/",
        server_name_filter: Optional[str] = None,
        clientid: Optional[str] = None,
        on_server_offline: Optional[Callable[[str], Awaitable[None]]] = None,
    ) -> None:
        self.mqtt_options = mqtt_options
        self.server_name_prefix = server_name_prefix
        self.server_name_filter = server_name_filter or f"{server_name_prefix}#"
        self.client = McpMqttClient(
            mqtt_options=mqtt_options,
            client_name=client_name,
            server_name_filter=self.server_name_filter,
            clientid=clientid,
            on_tools_updated=self._handle_tools_update,
            on_server_status=self._handle_server_status,
        )
        self._tools: Dict[str, List[BaseTool]] = {}
        self._status: Dict[str, str] = {}
        self._tool_events: Dict[str, anyio.Event] = {}
        self._start_lock = anyio.Lock()
        self._tg: Optional[anyio.abc.TaskGroup] = None
        self._tg_entered = False
        self._started = False
        self._offline_callback = on_server_offline

    async def ensure_started(self) -> None:
        await self.start()

    async def start(self) -> None:
        async with self._start_lock:
            if self._started:
                return
            logger.info(
                "Starting MCP server registry (filter=%s, client=%s)",
                self.server_name_filter,
                self.client.client_name,
            )
            self._tg = anyio.create_task_group()
            await self._tg.__aenter__()
            self._tg_entered = True
            self._tg.start_soon(self.client.start)
            result = await self.client.connect()
            if result is False:
                raise RuntimeError("Failed to connect to MCP MQTT transport")
            logger.info("MCP server registry connected to MQTT broker %s:%s", self.mqtt_options.host, self.mqtt_options.port)
            self._started = True

    async def stop(self) -> None:
        async with self._start_lock:
            if not self._started:
                return
            logger.info("Stopping MCP server registry")
            await self.client.stop()
            if self._tg and self._tg_entered:
                await self._tg.__aexit__(None, None, None)
            self._tg = None
            self._tg_entered = False
            self._started = False
            logger.info("MCP server registry stopped")
            self._tools.clear()
            self._tool_events.clear()
            self._status.clear()

    def _handle_tools_update(self, server_name: str, tools: Sequence[BaseTool]) -> None:
        tool_list = list(tools)
        self._tools[server_name] = tool_list
        if tool_list:
            event = self._tool_events.get(server_name)
            if event is None:
                event = anyio.Event()
                self._tool_events[server_name] = event
            event.set()
        else:
            # reset wait event so future waiters block until new tools arrive
            self._tool_events[server_name] = anyio.Event()

    def _handle_server_status(self, server_name: str, status: str) -> None:
        self._status[server_name] = status
        if status == "offline":
            self._tools.pop(server_name, None)
            self._tool_events.pop(server_name, None)
            if self._offline_callback and self._tg and self._tg_entered:
                try:
                    self._tg.start_soon(self._offline_callback, server_name)
                except Exception as exc:
                    logger.warning("Failed to schedule offline callback for %s: %s", server_name, exc)

    def derive_server_name(self, device_id: str) -> str:
        if device_id.startswith(self.server_name_prefix):
            return device_id
        if "/" in device_id:
            suffix = device_id.rsplit("/", 1)[-1]
        elif "-" in device_id:
            suffix = device_id.split("-")[-1]
        else:
            suffix = device_id
        return f"{self.server_name_prefix}{suffix}"

    def list_servers(self) -> List[str]:
        return list({*self._tools.keys(), *(server.server_name for server in self.client.get_mcp_servers())})

    def get_status(self, server_name: str) -> Optional[str]:
        return self._status.get(server_name)

    def get_tools_now(self, server_name: str) -> List[BaseTool]:
        return self._tools.get(server_name, [])

    async def wait_for_tools(self, server_name: str, timeout: Optional[float] = None) -> List[BaseTool]:
        current = self._tools.get(server_name)
        if current:
            return current

        event = self._tool_events.setdefault(server_name, anyio.Event())

        if timeout is None:
            await event.wait()
        elif timeout > 0:
            with anyio.move_on_after(timeout):
                await event.wait()
        # timeout == 0 simply falls through
        return self._tools.get(server_name, [])

    async def get_tools_for_device(
        self,
        device_id: str,
        *,
        wait: bool = False,
        timeout: Optional[float] = None,
    ) -> Tuple[str, List[BaseTool]]:
        server_name = self.derive_server_name(device_id)
        if wait:
            tools = await self.wait_for_tools(server_name, timeout=timeout)
        else:
            tools = self.get_tools_now(server_name)
        return server_name, tools


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
