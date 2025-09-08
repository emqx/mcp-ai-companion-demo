import asyncio
import anyio
from conversation_agent import ConversationAgent, ResponseType


async def test_agent():
    """Test conversation agent"""

    print("=" * 50)
    print("Conversation Agent Test")
    print("Type 'exit' to quit")
    print("Type 'tools' to view available tools")
    print("Type 'history' to clear history")
    print("=" * 50)

    async with anyio.create_task_group() as tg:
        # Create conversation agent
        agent = ConversationAgent(device_id="companion-001")

        # Initialize MCP
        await agent.init_mcp(tg, server_name_filter="#")

        async def chat_loop():
            while True:
                try:
                    user_input = await asyncio.to_thread(input, "\nUser: ")

                    if user_input.lower() == 'exit':
                        break
                    elif user_input.lower() == 'tools':
                        all_tools = agent.agent.tools
                        print(f"Available tools ({len(all_tools)}):")
                        for tool in all_tools:
                            print(f"  - {tool.metadata.name}: {tool.metadata.description}")
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
                            print(f"\n[Tool Call] Name: {response.tool_name}")
                            if response.tool_args:
                                print(f"[Tool Args] {response.tool_args}")
                            if response.tool_result:
                                print(f"[Tool Result] {response.tool_result}")
                        elif response.type == ResponseType.ERROR:
                            print(f"\nError: {response.content}")

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
    asyncio.run(test_agent())
