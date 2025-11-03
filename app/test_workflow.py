import asyncio
import json
import logging
import os
import subprocess
from pathlib import Path

import anyio
from starlette.testclient import TestClient

from conversation_workflow import ConversationWorkflow, ResponseType
from custom_llm_service import build_app
from llm import BaseLLMClient, ChatMessage, ChatRequest, ChatResponse, StreamChunk
from llm.custom import CustomLLMClient

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

os.environ.setdefault("EMOTION_LLM_API_KEY", "dummy-emotion-key")

try:
    import pytest  # type: ignore
except ImportError:  # pragma: no cover - pytest not installed in interactive mode
    pytest = None


class _MockStreamResponse:
    def __init__(self, lines):
        self.status_code = 200
        self._lines = lines

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def aiter_lines(self):
        for line in self._lines:
            await asyncio.sleep(0)
            yield line


class _MockAsyncClient:
    def __init__(self, *, timeout, headers, lines=None):
        self._timeout = timeout
        self._headers = headers
        self._lines = lines or []

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    def stream(self, method, url, json):
        return _MockStreamResponse(self._lines)


def test_custom_llm_client_stream_parsing():
    async def _run():
        lines = [
            'data: {"choices": [{"delta": {"content": "Hel"}, "finish_reason": null, "index": 0}]}',
            'data: {"choices": [{"delta": {"content": "lo"}, "finish_reason": null, "index": 0}]}',
            'data: {"choices": [{"delta": {}, "finish_reason": "stop", "index": 0}]}',
            "data: [DONE]",
        ]

        def factory(**kwargs):
            return _MockAsyncClient(lines=lines, **kwargs)

        client = CustomLLMClient(
            url="https://example.com/v1/chat",
            model="demo",
            client_factory=factory,
        )

        request = ChatRequest(messages=[ChatMessage(role="user", content="Hello")])

        tokens = []
        async for chunk in client.stream_chat(request):
            tokens.append((chunk.content, chunk.is_final))

        assert tokens[0][0] == "Hel"
        assert tokens[1][0] == "lo"
        assert any(is_final for _, is_final in tokens)

    asyncio.run(_run())


class _DummyLLMClient(BaseLLMClient):
    name = "dummy"

    async def stream_chat(self, request: ChatRequest):
        yield StreamChunk(content="", is_final=False)
        yield StreamChunk(content="Hello", is_final=False)
        yield StreamChunk(content=" world", is_final=True)

    async def complete(self, request: ChatRequest) -> ChatResponse:
        return ChatResponse(text="Hello world")


def test_custom_llm_service_streaming():
    dummy = _DummyLLMClient()
    app = build_app(llm_client=dummy, expected_api_key="test-token")
    client = TestClient(app)

    payload = {
        "messages": [{"role": "user", "content": "ping"}],
        "stream": True,
        "temperature": 0.5,
        "top_p": 0.9,
        "model": "dummy-model",
    }

    events = []
    with client.stream(
        "POST",
        "/chat-stream",
        headers={"Authorization": "Bearer test-token"},
        json=payload,
    ) as response:
        for chunk in response.iter_text():
            if chunk:
                for line in chunk.strip().splitlines():
                    line = line.strip()
                    if line:
                        events.append(line)

    assert events[-1] == "data: [DONE]"
    data_events = [line for line in events if line.startswith("data: {")]
    assert len(data_events) >= 3  # initial role, streamed tokens, final chunk
    final_event = json.loads(data_events[-1][6:])
    assert final_event["choices"][0]["finish_reason"] == "stop"


def test_custom_llm_service_auth_failure():
    dummy = _DummyLLMClient()
    app = build_app(llm_client=dummy, expected_api_key="secret")
    client = TestClient(app)
    response = client.post("/chat-stream", json={"messages": []})
    assert response.status_code == 401


def test_external_llm_validator_tool():
    if pytest is None:
        raise RuntimeError("pytest is required to run this test – install it via `uv add --dev pytest`.")

    tool_path = os.getenv("LLM_VALIDATOR_TOOL")
    if not tool_path:
        pytest.skip("LLM_VALIDATOR_TOOL is not set; skipping external validator test.")

    tool = Path(tool_path)
    if not tool.exists():
        pytest.skip(f"Validator tool not found at {tool}")

    url = os.getenv("LLM_VALIDATOR_URL")
    if not url:
        pytest.skip("LLM_VALIDATOR_URL is not set; skipping external validator test.")

    model = os.getenv("LLM_VALIDATOR_MODEL", "")
    api_key = os.getenv("LLM_VALIDATOR_API_KEY", "")
    question = os.getenv("LLM_VALIDATOR_QUESTION", "Hello")

    cmd = [str(tool), url, model or "", api_key or "", question or ""]
    result = subprocess.run(cmd, capture_output=True, text=True)  # nosec B603

    if result.returncode != 0:
        pytest.fail(
            f"Validator tool exited with {result.returncode}\n"
            f"stdout:\n{result.stdout}\n"
            f"stderr:\n{result.stderr}"
        )

    if "[DONE]" not in result.stdout:
        pytest.fail(
            "Validator tool did not emit '[DONE]' sentinel.\n"
            f"stdout:\n{result.stdout}\n"
            f"stderr:\n{result.stderr}"
        )


async def test_new_workflow():
    """Interactive test for manual use."""

    print("=" * 50)
    print("New Conversation Workflow Test")
    print("Type 'exit' to quit")
    print("Type 'history' to clear history")
    print("=" * 50)

    async with anyio.create_task_group() as tg:
        workflow = ConversationWorkflow(device_id="native-companion-001")

        await workflow.init_mcp(server_name_filter="#")

        async def chat_loop():
            while True:
                try:
                    user_input = await asyncio.to_thread(input, "\nUser: ")

                    if user_input.lower() == "exit":
                        break
                    if user_input.lower() == "history":
                        workflow.clear_history()
                        print("History cleared")
                        continue

                    print("Assistant: ", end="", flush=True)
                    async for response in workflow.stream_chat(user_input):
                        if response.type == ResponseType.STREAM_CHUNK and response.content:
                            print(response.content, end="", flush=True)
                        elif response.type == ResponseType.STREAM_END:
                            print()
                        elif response.type == ResponseType.TOOL_CALL:
                            print(f"\n[Tool] {response.tool_name}({response.tool_args})")
                            if response.tool_result:
                                print(f"[Result] {response.tool_result}")
                        elif response.type == ResponseType.ERROR:
                            print(f"\n[Error] {response.content}")

                except KeyboardInterrupt:
                    print("\nExiting...")
                    break
                except Exception as exc:  # pragma: no cover - interactive
                    print(f"Error: {exc}")

            await workflow.shutdown()

        tg.start_soon(chat_loop)
