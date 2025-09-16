import random
import sys
import json
import threading
import queue

import asyncio, anyio
from conversation_workflow import ConversationWorkflow, ResponseType

# Message queue for sending to TTS
tts_queue = queue.Queue()

# Receive ASR results for LLM to answer user questions
asr_queue = queue.Queue()

inflight_requests: dict[int, dict] = {}
next_request_id: int = 1

workflow: ConversationWorkflow = None
main_loop = None  # Reference to main thread's event loop
current_device_id = None  # Store current device ID
mcp_server_name_prefix = "web-ui-hardware-controller/"

def read_message():
    """Read a JSON message from stdin."""
    line = sys.stdin.readline()
    if not line:
        return None

    # Strip whitespace and check if line is empty after stripping
    line = line.strip()
    if not line:
        return False

    try:
        return json.loads(line)
    except json.JSONDecodeError as e:
        print(f"JSON decode error: {e}, line: '{line}'", file=sys.stderr)
        return False


def send_message(message):
    """Send a JSON message to stdout."""
    sys.stdout.write(json.dumps(message) + "\n")
    sys.stdout.flush()


def tts_worker():
    global next_request_id
    global inflight_requests
    current_task_id = None
    while True:
        tts_msg = tts_queue.get()
        if tts_msg is None:
            break

        # Check if this is a streaming chunk
        is_chunk = isinstance(tts_msg, dict) and tts_msg.get('is_chunk', False)
        text = tts_msg.get('text', '') if isinstance(tts_msg, dict) else tts_msg

        if is_chunk:
            # For streaming chunks, reuse the same task_id
            if current_task_id is None:
                current_task_id = random.randint(1, 999999)
                # Send start message for the stream
                next_request_id = next_request_id + 1
                start_request = {
                    "jsonrpc": "2.0",
                    "id": next_request_id,
                    "method": "tts_and_send_start",
                    "params": {
                        "task_id": current_task_id,
                    },
                }
                inflight_requests[next_request_id] = start_request
                send_message([start_request])

            # Send the chunk
            next_request_id = next_request_id + 1
            chunk_request = {
                "jsonrpc": "2.0",
                "id": next_request_id,
                "method": "tts_and_send",
                "params": {
                    "task_id": current_task_id,
                    "text": text,
                },
            }
            inflight_requests[next_request_id] = chunk_request
            send_message([chunk_request])

            # Check if this is the last chunk
            if isinstance(tts_msg, dict) and tts_msg.get('is_final', False):
                next_request_id = next_request_id + 1
                finish_request = {
                    "jsonrpc": "2.0",
                    "id": next_request_id,
                    "method": "tts_and_send_finish",
                    "params": {
                        "task_id": current_task_id,
                    },
                }
                inflight_requests[next_request_id] = finish_request
                send_message([finish_request])
                current_task_id = None
        else:
            # Non-streaming message (complete message)
            task_id = random.randint(1, 999999)

            current_request_0 = {
                "jsonrpc": "2.0",
                "id": next_request_id,
                "method": "tts_and_send_start",
                "params": {
                    "task_id": task_id,
                },
            }
            inflight_requests[next_request_id] = current_request_0

            next_request_id = next_request_id + 1
            current_request_1 = {
                "jsonrpc": "2.0",
                "id": next_request_id,
                "method": "tts_and_send",
                "params": {
                    "task_id": task_id,
                    "text": text,
                },
            }
            inflight_requests[next_request_id] = current_request_1

            next_request_id = next_request_id + 1
            current_request_2 = {
                "jsonrpc": "2.0",
                "id": next_request_id,
                "method": "tts_and_send_finish",
                "params": {
                    "task_id": task_id,
                },
            }
            inflight_requests[next_request_id] = current_request_2

            batch_request = [
                current_request_0,
                current_request_1,
                current_request_2,
            ]
            send_message(batch_request)


def asr_worker():
    global next_request_id
    global inflight_requests
    global workflow
    global main_loop
    while True:
        tts_msg = asr_queue.get()

        async def _run_and_consume():
            async for response in workflow.stream_chat(user_input=tts_msg):
                if response.type == ResponseType.STREAM_CHUNK:
                    if response.content:  # Non-empty chunk
                        tts_queue.put({
                            'text': response.content,
                            'is_chunk': True,
                            'is_final': False
                        })
                elif response.type == ResponseType.STREAM_END:
                    # Empty chunk signals end of stream
                    tts_queue.put({
                        'text': '',
                        'is_chunk': True,
                        'is_final': True
                    })
                elif response.type == ResponseType.TOOL_CALL:
                    # Handle tool calls if needed
                    pass
                elif response.type == ResponseType.ERROR:
                    print(f"Agent error: {response.content}", file=sys.stderr)

        # Submit async task to main thread event loop for execution
        if main_loop and main_loop.is_running():
            asyncio.run_coroutine_threadsafe(_run_and_consume(), main_loop)
        else:
            print("Warning: main_loop not running; dropping ASR task")

async def main():
    global main_loop
    main_loop = asyncio.get_event_loop()

    tts_thread = threading.Thread(target=tts_worker, daemon=True)
    tts_thread.start()

    asr_thread = threading.Thread(target=asr_worker, daemon=True)
    asr_thread.start()

    global workflow
    workflow = ConversationWorkflow()

    send_message(
        {
            "jsonrpc": "2.0",
            "id": next_request_id,
            "method": "init",
            "params": {
                "protocol_version": "1.0",
                "config": {"asr": {"auto_merge": True}},
            },
        }
    )
    result = await asyncio.to_thread(read_message)
    if not result:
        print("No more input, exiting.")
        if workflow:
            await workflow.shutdown()
        sys.exit(0)

    # Handle JSON decode errors gracefully
    if not isinstance(result, dict):
        print(f"Invalid response format: {result}")
        sys.exit(1)

    if result["result"] != "ok" or result["id"] != next_request_id:
        print(f"Failed to initialize agent, got: {result}")
        sys.exit(1)

    # Put main loop in background task to keep main event loop active
    async def main_loop_task():
        while True:
            msg = await asyncio.to_thread(read_message)
            if msg is None:
                print("No more input, exiting...")
                if workflow:
                    await workflow.shutdown()
                break
            if not msg:
                # Skip None messages (empty lines, JSON decode errors, etc.)
                # Add small delay to prevent busy waiting
                await asyncio.sleep(0.01)
                continue
            if isinstance(msg, list):
                await handle_batch(msg)
            if isinstance(msg, dict):
                await handle_single(msg)

    # Create background task without blocking main coroutine
    main_task = asyncio.create_task(main_loop_task())

    # Main coroutine can now handle other async tasks
    try:
        # Wait for main loop task to complete
        await main_task
    except KeyboardInterrupt:
        print("\nReceived interrupt, exiting...")
        main_task.cancel()
    except Exception as e:
        print(f"Main loop error: {e}")
        main_task.cancel()


async def handle_asr_result(params):
    """Handle ASR result method"""
    recognized_text = params.get("text", "")
    asr_queue.put(recognized_text)

async def handle_set_device_id(params):
    """Handle set device ID method"""
    global workflow
    global current_device_id
    device_id = params.get("device_id", "")
    current_device_id = device_id  # Save device ID globally
    suffix = device_id.split("-")[-1] if "-" in device_id else device_id
    server_name_filter = mcp_server_name_prefix + suffix
    await workflow.init_mcp(server_name_filter=server_name_filter, device_id=device_id)
    print(f"MCP initialized with server name filter: {server_name_filter}, device_id: {device_id}")

async def handle_message_from_device(params):
    """Handle message from device method"""
    payload = params.get("payload", "")
    if payload:
        asr_queue.put(payload)

async def handle_method_request(msg):
    """Handle method requests"""
    params = msg.get("params", {})
    method = msg["method"]

    method_handlers = {
        "asr_result": lambda: handle_asr_result(params),
        "set_device_id": lambda: handle_set_device_id(params),
        "message_from_device": lambda: handle_message_from_device(params)
    }

    handler = method_handlers.get(method)
    if handler:
        await handler()
    else:
        print(f"Unknown method: {method}")

async def handle_result_response(msg):
    """Handle result responses"""
    global inflight_requests

    if msg["id"] not in inflight_requests:
        print(f"Unknown id in response: {msg['id']}")
        exit(1)

    if "error" in msg:
        params = msg.get("params", "")
        print(f"Got error response: {msg['error']}, params: {params}")
        exit(1)

    current_request = inflight_requests.pop(msg["id"])
    print(f"Received result: {msg['result']} for request: {current_request}")

async def handle_single(msg):
    if "method" in msg:
        await handle_method_request(msg)
    if "result" in msg:
        await handle_result_response(msg)


async def handle_batch(msgs):
    for msg in msgs:
       await handle_single(msg)


if __name__ == "__main__":
    asyncio.run(main())
