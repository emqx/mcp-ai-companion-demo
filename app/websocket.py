import asyncio
import json
import random
import traceback

import anyio
import websockets
from typing import Dict, Optional
from datetime import datetime
from conversation_workflow import ConversationWorkflow, ResponseType
from utils.colored_logger import get_agent_logger

logger = get_agent_logger("chat")
mcp_server_name_prefix = "web-ui-hardware-controller/"

class DeviceManager:
    def __init__(self, websocket):
        self.websocket = websocket
        self.devices: Dict[str, asyncio.Queue] = {}  # device_id -> 消息队列
        self.device_tasks: Dict[str, asyncio.Task] = {}  # device_id -> 协程任务
        self.workflows: Dict[str, ConversationWorkflow] = {}  # device_id -> ConversationWorkflow实例
        self.current_task_ids: Dict[str, Optional[str]] = {}  # device_id -> 当前任务ID

    async def start_device(self, device_id: str) -> None:
        if device_id in self.device_tasks:
            # stop the existing device first
            await self.stop_device(device_id)
        
        # create a new message queue for the device
        self.devices[device_id] = asyncio.Queue()
        # start the device coroutine
        task = asyncio.create_task(self.device_coroutine(device_id))
        self.device_tasks[device_id] = task

    async def stop_device(self, device_id: str) -> None:
        if device_id in self.device_tasks:
            # 取消任务
            task = self.device_tasks[device_id]
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

            del self.device_tasks[device_id]
            if device_id in self.devices:
                del self.devices[device_id]

            if device_id in self.workflows:
                workflow = self.workflows[device_id]
                await workflow.shutdown()
                del self.workflows[device_id]

            if device_id in self.current_task_ids:
                del self.current_task_ids[device_id]

            logger.info(f"Stopped device coroutine: {device_id}")

    async def device_coroutine(self, device_id: str):
        logger.info(f"Device coroutine {device_id} started")
        workflow = ConversationWorkflow()
        suffix = device_id.split("-")[-1] if "-" in device_id else device_id
        server_name_filter = mcp_server_name_prefix + suffix
        await workflow.init_mcp(server_name_filter=server_name_filter, device_id=device_id)
        self.workflows[device_id] = workflow
        logger.info(f"MCP initialized with server name filter: {server_name_filter}, device_id: {device_id}")
        try:
            queue = self.devices[device_id]
            while True:
                message = await queue.get()
                await self.process_device_message(device_id, message)

        except asyncio.CancelledError:
            logger.info(f"Device coroutine {device_id} cancelled")
            raise
        except Exception as e:
            logger.error(f"Device coroutine {device_id} error: {e}")

    async def process_device_message(self, device_id: str, message: dict) -> None:
        logger.info(f"Device {device_id} processing message: {message}")
        method = message.get('method')
        params = message.get('params', {})
        device_id = params.get('device_id')
        workflow = self.workflows.get(device_id)
        if method == 'asr_result':
            input_text = params.get('text', None)
        elif method == 'message_from_device':
            input_text = params.get('payload', None)
        else:
            logger.warning(f"Unknown method {method} for device {device_id}")
            return

        if input_text:
            async for response in workflow.stream_chat(user_input=input_text):
                if response.type == ResponseType.STREAM_CHUNK:
                    if response.content:  # Non-empty chunk
                        await self.send_tts_request(device_id, response.content)
                elif response.type == ResponseType.STREAM_END:
                        await self.send_tts_finish(device_id)
                elif response.type == ResponseType.TOOL_CALL:
                    # Handle tool calls if needed
                    pass
                elif response.type == ResponseType.ERROR:
                    logger.error(f"Error in workflow for device {device_id}: {response}")

    async def send_tts_request(self, device_id: str, text: str) -> None:
        logger.info(f"Sent tts_request to device {device_id}: {text}")
        current_task_id = self.current_task_ids.get(device_id)
        if current_task_id is None:
            request_id = random.randint(1, 999999)
            current_task_id = f"task-{int(datetime.now().timestamp())}-{request_id}"
            self.current_task_ids[device_id] = current_task_id
            await send_json_rpc_request(self.websocket, "tts_and_send_start", request_id,
                                  {"task_id": current_task_id, "device_id": device_id})
            await send_json_rpc_request(self.websocket, "tts_and_send", request_id + 1,
                                  {"task_id": current_task_id, "device_id": device_id, "text": text})
        else:
            request_id = random.randint(1, 999999)
            await send_json_rpc_request(self.websocket, "tts_and_send", request_id,
                                  {"task_id": current_task_id, "device_id": device_id, "text": text})

    async def send_tts_finish(self, device_id: str) -> None:
        logger.info(f"Sent tts_finish to device {device_id}")
        current_task_id = self.current_task_ids.get(device_id)
        if current_task_id:
            request_id = random.randint(1, 999999)
            await send_json_rpc_request(self.websocket, "tts_and_send_finish", request_id,
                                  {"task_id": current_task_id, "device_id": device_id})
            self.current_task_ids[device_id] = None

    async def route_message(self, message: dict) -> None:
        params = message.get('params', {})
        device_id = params.get('device_id')
        msg_q = self.devices.get(device_id)
        if not msg_q:
            logger.warning(f"No message queue for device {device_id}, we start it now.")
            await self.start_device(device_id)
            msg_q = self.devices.get(device_id)
            if not msg_q:
                logger.error(f"Failed to create message queue for device {device_id}")
                return
        # 将消息放入对应设备的队列
        await msg_q.put(message)

    async def cleanup(self):
        """Clean up all device coroutines"""
        for device_id in list(self.device_tasks.keys()):
            await self.stop_device(device_id)

class LineBufferedWebSocketHandler:
    def __init__(self):
        self.buffer = ""
        self.websocket = None

    async def handle_client(self, websocket: websockets.ServerConnection):
        """Handle a single client connection"""
        logger.info(f"Client connected: {websocket.remote_address}")
    
        self.websocket = websocket
        self.buffer = ""
        device_manager = DeviceManager(websocket)

        try:
            async for message in websocket:
                self.buffer += message
                
                while '\n' in self.buffer:
                    line_end = self.buffer.index('\n')
                    complete_line = self.buffer[:line_end]
                    self.buffer = self.buffer[line_end + 1:]
                    
                    if complete_line:
                        try:
                            json_message = json.loads(complete_line)
                        except json.JSONDecodeError:
                            logger.error(f"Json decode failed: {complete_line}")
                            continue

                        await self.process_message(json_message, device_manager)

        except websockets.exceptions.ConnectionClosed:
            logger.info(f"Client disconnected: {websocket.remote_address}")
        except Exception as e:
            logger.error(f"Error when handling client: {e}, stacktrace: {traceback.format_exc()}")
        finally:
            # Clean up all device coroutines
            await device_manager.cleanup()
            if self.buffer.strip():
                logger.warning(f"Buffer still has unprocessed data: {self.buffer}")

    async def process_message(self, message: dict, device_manager: DeviceManager) -> None:
        method = message.get('method')
        params = message.get('params', {})
        device_id = params.get('device_id')
        id = message.get('id', None)
        if method and id:
            ## reply the request immediately
            await send_json_rpc_result(self.websocket, method, id, "ok")
        if method and (not device_id):
            if id:
                await send_json_rpc_error(self.websocket, id, -32602, f"Missing device_id for method {method}")
            else:
                logger.warning("Received message without device_id and id")
            return

        if method == 'start_device':
            # start the device coroutine
            await device_manager.start_device(device_id)
        elif method == 'stop_device':
            # stop the device coroutine
            await device_manager.stop_device(device_id)
        elif method is None and 'id' in message:
            # handle responses
            pass
        else:
            # route other messages to the corresponding device coroutine
            await device_manager.route_message(message)

async def send_json_rpc_error(websocket: websockets.ServerConnection, id, code, message):
    error_response = {
        "jsonrpc": "2.0",
        "error": {
            "code": code,
            "message": message
        },
        "id": id
    }
    await websocket.send(json.dumps(error_response) + '\n')

async def send_json_rpc_result(websocket: websockets.ServerConnection, method, id, result):
    result_response = {
        "jsonrpc": "2.0",
        "method": method,
        "id": id,
        "result": result
    }
    await websocket.send(json.dumps(result_response) + '\n')

async def send_json_rpc_request(websocket: websockets.ServerConnection, method, id, params):
    request = {
        "jsonrpc": "2.0",
        "method": method,
        "id": id,
        "params": params
    }
    await websocket.send(json.dumps(request) + '\n')

async def send_json_rpc_notification(websocket, method, params):
    notification = {
        "jsonrpc": "2.0",
        "method": method,
        "params": params
    }
    await websocket.send(json.dumps(notification) + '\n')

async def start_websocket_server(host='localhost', port=8765):
    """Start WebSocket server"""
    handler = LineBufferedWebSocketHandler()
    logger.info(f"WebSocket server started at ws://{host}:{port}")
    async with websockets.serve(handler.handle_client, host, port):
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(start_websocket_server())
