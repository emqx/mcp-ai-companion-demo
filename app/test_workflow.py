import asyncio
import anyio
import logging
from conversation_workflow import ConversationWorkflow, ResponseType

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


async def test_new_workflow():
    """Test New Conversation Workflow"""

    print("=" * 50)
    print("New Conversation Workflow Test")
    print("Type 'exit' to quit")
    print("Type 'history' to clear history")
    print("=" * 50)

    async with anyio.create_task_group() as tg:
        # Create New conversation workflow
        workflow = ConversationWorkflow(device_id="native-companion-001")

        # Initialize MCP
        await workflow.init_mcp(tg, server_name_filter="#")

        async def chat_loop():
            while True:
                try:
                    user_input = await asyncio.to_thread(input, "\nUser: ")

                    if user_input.lower() == 'exit':
                        break
                    elif user_input.lower() == 'history':
                        workflow.clear_history()
                        print("History cleared")
                        continue

                    # Streaming conversation
                    print("Assistant: ", end="", flush=True)
                    async for response in workflow.stream_chat(user_input):
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
            await workflow.shutdown()

        # Start chat loop
        tg.start_soon(chat_loop)


if __name__ == "__main__":
    asyncio.run(test_new_workflow())
