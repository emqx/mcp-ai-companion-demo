import asyncio
import anyio
from conversation_agent import ConversationAgent, ResponseType


async def test_agent():
    """测试对话代理"""

    print("=" * 50)
    print("对话代理测试")
    print("输入 'exit' 退出")
    print("输入 'tools' 查看工具")
    print("输入 'history' 清空历史")
    print("=" * 50)

    async with anyio.create_task_group() as tg:
        # 创建对话 agent
        agent = ConversationAgent(device_id="companion-001")

        # 初始化 MCP
        await agent.init_mcp(tg, server_name_filter="#")

        async def chat_loop():
            while True:
                try:
                    user_input = await asyncio.to_thread(input, "\n用户: ")

                    if user_input.lower() == 'exit':
                        break
                    elif user_input.lower() == 'tools':
                        all_tools = agent.agent.tools
                        print(f"可用工具 ({len(all_tools)}个):")
                        for tool in all_tools:
                            print(f"  - {tool.metadata.name}: {tool.metadata.description}")
                        continue
                    elif user_input.lower() == 'history':
                        agent.clear_history()
                        print("历史已清空")
                        continue

                    # 流式对话
                    print("助手: ", end="", flush=True)
                    async for response in agent.stream_chat(user_input):
                        if response.type == ResponseType.STREAM_CHUNK:
                            print(response.content, end="", flush=True)
                        elif response.type == ResponseType.STREAM_END:
                            print()  # 换行
                        elif response.type == ResponseType.TOOL_CALL:
                            # 打印工具调用详情
                            print(f"\n[工具调用] 名称: {response.tool_name}")
                            if response.tool_args:
                                print(f"[工具参数] {response.tool_args}")
                            if response.tool_result:
                                print(f"[工具结果] {response.tool_result}")
                        elif response.type == ResponseType.ERROR:
                            print(f"\n错误: {response.content}")

                except KeyboardInterrupt:
                    print("\n退出中...")
                    break
                except Exception as e:
                    print(f"错误: {e}")

            # 关闭
            await agent.shutdown()

        # 启动聊天循环
        tg.start_soon(chat_loop)


if __name__ == "__main__":
    asyncio.run(test_agent())
