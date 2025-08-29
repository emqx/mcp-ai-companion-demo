import random
import sys
import json
import threading
import queue

import asyncio
from mcp_client_init import initialize_mcp_client
from lamindex import ConversationalAgent
from lamindex import FuncCallEvent, MessageEvent

# 发送给 TTS 的消息队列
tts_queue = queue.Queue()

# 接收 ASR 结果，让 LLM 回答用户问题
asr_queue = queue.Queue()

inflight_requests: dict[int, dict] = {}
next_request_id: int = 1

agent: ConversationalAgent = None


def read_message():
    """Read a JSON message from stdin."""
    line = sys.stdin.readline()
    if not line:
        return None
    else:
        return json.loads(line)


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
    while True:
        tts_msg = asr_queue.get()

        async def _run_and_consume():
            handler = agent.run(user_input=tts_msg)
            async for ev in handler.stream_events():
                if isinstance(ev, FuncCallEvent):
                    # obj = {
                    #     "tool_name": ev.tool_name,
                    #     "tool_kwargs": ev.tool_kwargs,
                    # }
                    # if ev.tool_output is not None:
                    #     obj["tool_output"] = ev.tool_output
                    # self.send_to_server(
                    #     {
                    #         "jsonrpc": "2.0",
                    #         "id": self.unique_id,
                    #         "method": "mcp_tool_calling",
                    #         "obj": {
                    #             "tool_name": ev.tool_name,
                    #             "tool_kwargs": ev.tool_kwargs,
                    #         },
                    #     }
                    # )
                    pass
                elif isinstance(ev, MessageEvent):
                    tts_queue.put(ev.message)

        asyncio.run(_run_and_consume())


def create_agent():
    async def init_mcp_and_agent():
        # 初始化 MCP 客户端
        client_name = "stdio_client"
        host = "localhost"
        mcp_client = await initialize_mcp_client(
            client_name=client_name, host=host, wait_time=3.0
        )

        agent = ConversationalAgent(mcp_client=mcp_client)
        return agent

    # 在主线程中初始化（阻塞直到完成）
    agent = asyncio.run(init_mcp_and_agent())
    return agent


def main():
    tts_thread = threading.Thread(target=tts_worker, daemon=True)
    tts_thread.start()

    asr_thread = threading.Thread(target=asr_worker, daemon=True)
    asr_thread.start()

    global agent
    agent = create_agent()

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
    result = read_message()
    if not result:
        print("No more input, exiting.")
        sys.exit(1)
    elif result["result"] != "ok" or result["id"] != next_request_id:
        print(f"Failed to initialize agent, got: {result}")
        sys.exit(1)

    while True:
        msg = read_message()
        if msg is None:
            print("No more input, exiting.")
            break
        if isinstance(msg, list):
            handle_batch(msg)
        if isinstance(msg, dict):
            handle_single(msg)


def handle_single(msg):
    global inflight_requests
    if "method" in msg:
        if msg["method"] == "asr_result":
            if "id" in msg:
                print("asr_result should not have id")
                exit(1)
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
    main()
