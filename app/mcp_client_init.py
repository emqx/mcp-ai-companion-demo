from contextlib import AsyncExitStack
from datetime import timedelta

import anyio
from mcp.client.mqtt import InitializeResult, MqttTransportClient
from mcp.shared.mqtt import MqttOptions
from pydantic import BaseModel

class McpServer(BaseModel):
    server_name: str
    success: bool

class McpMqttClient:
    def __init__(self, mqtt_options: MqttOptions, client_name: str, server_name_filter: str, read_timeout: int = 10, clientid: str | None = None):
        self._mqtt_client = None
        self.clientid = clientid
        self.mqtt_options = mqtt_options
        self.read_timeout = read_timeout
        self.client_name = client_name
        self.server_name_filter = server_name_filter
        self.mcp_servers: list[McpServer] = []
        self._stop_event = anyio.Event()
        self._connected_event = anyio.Event()

    def is_connected(self) -> bool:
        return self._mqtt_client.is_connected() if self._mqtt_client else False

    async def start(self):
        print("MCP MQTT Client running ...")
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
        print("MCP MQTT Client termniated.")
        await self._exit_stack.aclose()

    async def stop(self):
        self._stop_event.set()

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
        print(f"Discovered MCP server name: {server_name}")
        self.mcp_servers.append(McpServer(server_name=server_name, success=False))

    async def on_mcp_disconnect(self, client, server_name):
        print(f"Disconnected from MCP server name: {server_name}")
        self.mcp_servers = [server for server in self.mcp_servers if server.server_name != server_name]

    async def on_mcp_connect(self, client, server_name, connect_result):
        success, _init_result = connect_result
        print(f"Connect to MCP server name: {server_name}, result: {success}")
        for server in self.mcp_servers:
            if server.server_name == server_name:
                server.success = success == "ok"
                break
        else:
            self.mcp_servers.append(McpServer(server_name=server_name, success=success))
