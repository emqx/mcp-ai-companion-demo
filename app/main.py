import random
import sys
import json
import threading
import queue

import asyncio, anyio
from lamindex import ConversationalAgent, init_mcp_and_agent
from lamindex import FuncCallEvent, MessageEvent

# 发送给 TTS 的消息队列
tts_queue = queue.Queue()

# 接收 ASR 结果，让 LLM 回答用户问题
asr_queue = queue.Queue()

inflight_requests: dict[int, dict] = {}
next_request_id: int = 1

agent: ConversationalAgent = None
main_loop = None  # 主线程的事件循环引用


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
    while True:
        tts_msg = tts_queue.get()
        next_request_id = next_request_id + 1
        if tts_msg is None:
            break
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
                "text": tts_msg,
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
    global agent
    global main_loop
    while True:
        tts_msg = asr_queue.get()

        async def _run_and_consume():
            handler = agent.run(user_input=tts_msg)
            async for ev in handler.stream_events():
                if isinstance(ev, FuncCallEvent):
                    # INSERT_YOUR_CODE
                    pass
                elif isinstance(ev, MessageEvent):
                    if ev.message:
                        tts_queue.put(ev.message)

        # 将异步任务提交到主线程事件循环执行
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

    tg = anyio.create_task_group()
    await tg.__aenter__()

    global agent
    (agent, mcp_client) = await init_mcp_and_agent(tg)

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
        await mcp_client.stop()
        sys.exit(0)

    # Handle JSON decode errors gracefully
    if not isinstance(result, dict):
        print(f"Invalid response format: {result}")
        sys.exit(1)

    if result["result"] != "ok" or result["id"] != next_request_id:
        print(f"Failed to initialize agent, got: {result}")
        sys.exit(1)

    # 将主循环放到后台任务中，让主事件循环保持活跃
    async def main_loop_task():
        while True:
            msg = await asyncio.to_thread(read_message)
            if msg is None:
                print("No more input, exiting...")
                await mcp_client.stop()
                break
            if not msg:
                # Skip None messages (empty lines, JSON decode errors, etc.)
                # Add small delay to prevent busy waiting
                await asyncio.sleep(0.01)
                continue
            if isinstance(msg, list):
                handle_batch(msg)
            if isinstance(msg, dict):
                handle_single(msg)

    # 创建后台任务，不阻塞主协程
    main_task = asyncio.create_task(main_loop_task())

    # 主协程现在可以处理其他异步任务
    try:
        # 等待主循环任务完成
        await main_task
    except KeyboardInterrupt:
        print("\nReceived interrupt, exiting...")
        main_task.cancel()
    except Exception as e:
        print(f"Main loop error: {e}")
        main_task.cancel()


def handle_single(msg):
    global inflight_requests
    if "method" in msg:
        if msg["method"] == "asr_result":
            # Extract the recognized text from the asr_result message and put it into the asr_queue
            params = msg.get("params", {})
            recognized_text = params.get("text", "")
            asr_queue.put(recognized_text)
    if "result" in msg:
        if msg["id"] not in inflight_requests:
            print(f"Unknown id in response: {msg['id']}")
            exit(1)
        if "error" in msg:
            params = msg["params"] if "params" in msg else ""
            print(f"Got error response: {msg['error']}, params: {params}")
            exit(1)
        else:
            current_request = inflight_requests.pop(msg["id"])
            print(f"Received result: {msg['result']} for request: {current_request}")


def handle_batch(msgs):
    for msg in msgs:
        handle_single(msg)


if __name__ == "__main__":
    asyncio.run(main())
