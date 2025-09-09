import asyncio
import anyio
import logging
import os
from native_conversation_agent import NativeConversationAgent, ResponseType

# 设置日志级别以显示时延分析
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


async def test_native_agent():
    """Test Native Conversation Agent with parallel processing"""
    
    # Check for API key
    if not os.environ.get("DASHSCOPE_API_KEY"):
        print("❌ DASHSCOPE_API_KEY environment variable is required")
        print("Please set your API key: export DASHSCOPE_API_KEY=your_key_here")
        print("Then run this test again")
        return

    print("=" * 50)
    print("Native Conversation Agent Test (Parallel Processing)")
    print("Type 'exit' to quit")
    print("Type 'stats' to view agent statistics")
    print("Type 'history' to clear history")
    print("=" * 50)

    async with anyio.create_task_group() as tg:
        # Create Native conversation agent
        agent = NativeConversationAgent(device_id="native-companion-001")

        # Initialize MCP
        await agent.init_mcp(tg, server_name_filter="#")

        async def chat_loop():
            while True:
                try:
                    user_input = await asyncio.to_thread(input, "\nUser: ")

                    if user_input.lower() == 'exit':
                        break
                    elif user_input.lower() == 'stats':
                        # Show agent statistics
                        stats = agent.get_stats()
                        print("=== Agent Statistics ===")
                        for key, value in stats.items():
                            print(f"{key}: {value}")
                        continue
                    elif user_input.lower() == 'history':
                        agent.clear_history()
                        print("History cleared")
                        continue

                    # Streaming conversation
                    print("Assistant: ", end="", flush=True)
                    async for response in agent.stream_chat(user_input):
                        if response.type == ResponseType.STREAM_CHUNK:
                            print(response.content, end="", flush=True)
                        elif response.type == ResponseType.STREAM_END:
                            print()  # Newline
                        elif response.type == ResponseType.TOOL_CALL:
                            # Print tool call details
                            print(f"\n[🔧 Tool Call] {response.tool_name}({response.tool_args})")
                            if response.tool_result:
                                print(f"[✅ Result] {response.tool_result}")
                        elif response.type == ResponseType.ERROR:
                            print(f"\n❌ Error: {response.content}")

                except KeyboardInterrupt:
                    print("\nExiting...")
                    break
                except Exception as e:
                    print(f"Error: {e}")

            # Close
            await agent.shutdown()

        # Start chat loop
        tg.start_soon(chat_loop)


if __name__ == "__main__":
    asyncio.run(test_native_agent())