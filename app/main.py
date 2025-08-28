#!/usr/bin/env python3
import json
import threading
import time
import logging
import os
import sys
from typing import Dict, Any, Callable, List, Union
import asyncio
from mcp_client_init import initialize_mcp_client, get_mcp_tools
from lamindex import ConversationalAgent
from llama_index.core.workflow import Context
from lamindex import FuncCallEvent, MessageEvent


# 配置日志
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - CLIENT - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


class StdioClientForServer:
    def __init__(self):
        """
        初始化客户端 - 被服务器启动模式
        这个客户端会被服务器进程启动，通过管道与服务器通信
        """
        self.running = False
        self.response_handlers: Dict[str, Callable] = {}
        self.message_id_counter = 0
        self.agent: ConversationalAgent = None

        # 检查是否被服务器启动
        self.launched_by_server = os.getenv("LAUNCHED_BY_SERVER") == "1"
        self.server_pid = os.getenv("SERVER_PID")

        # 注册默认响应处理器
        self._register_default_handlers()

        # 注册消息处理器（处理来自服务器的消息）
        self.message_handlers = {
            "ping": self.handle_ping,
            "echo": self.handle_echo,
            "calculate": self.handle_calculate,
            "shutdown": self.handle_shutdown,
            "server_ready": self.handle_server_ready,
            # 以下才是有真实数据的服务端返回
            "asr_reusult": self.handle_asr_result,
        }

    def _register_default_handlers(self):
        """注册默认的响应处理器"""
        self.response_handlers.update(
            {
                "pong": self._handle_pong,
                "echo_response": self._handle_echo_response,
                "calculation_result": self._handle_calculation_result,
                "calculation_error": self._handle_calculation_error,
                "shutdown_ack": self._handle_shutdown_ack,
            }
        )

    def _handle_pong(self, message: Dict[str, Any]):
        """处理 pong 响应"""
        logger.info(f"收到 pong: {message.get('message')}")

    def _handle_echo_response(self, message: Dict[str, Any]):
        """处理 echo 响应"""
        logger.info(f"Echo 响应: {message.get('echoed_message')}")

    def _handle_calculation_result(self, message: Dict[str, Any]):
        """处理计算结果响应"""
        logger.info(f"计算结果: {message.get('expression')} = {message.get('result')}")

    def _handle_calculation_error(self, message: Dict[str, Any]):
        """处理计算错误响应"""
        logger.error(f"计算错误: {message.get('error')}")

    def _handle_shutdown_ack(self, message: Dict[str, Any]):
        """处理关闭确认响应"""
        logger.info(f"服务器关闭确认: {message.get('message')}")
        self.running = False

    def handle_ping(self, message: Dict[str, Any]):
        """处理来自服务器的 ping 消息"""
        logger.info(f"收到服务器 ping: {message.get('timestamp')}")

        # 发送 pong 响应
        response = {
            "type": "pong",
            "id": message.get("id"),
            "timestamp": time.time(),
            "message": "pong from client",
        }
        self.send_to_server(response)

    def handle_echo(self, message: Dict[str, Any]):
        """处理来自服务器的 echo 消息"""
        original_text = message.get("message", "")
        logger.info(f"收到服务器 echo: {original_text}")

        # 发送 echo 响应
        response = {
            "type": "echo_response",
            "id": message.get("id"),
            "original_message": original_text,
            "echoed_message": f"Client echoes: {original_text}",
        }
        self.send_to_server(response)

    def handle_calculate(self, message: Dict[str, Any]):
        """处理来自服务器的计算消息"""
        expression = message.get("expression", "")
        logger.info(f"收到服务器计算请求: {expression}")

        try:
            result = eval(expression)  # 注意：生产环境中应该使用更安全的表达式解析

            response = {
                "type": "calculation_result",
                "id": message.get("id"),
                "expression": expression,
                "result": result,
            }
        except Exception as e:
            response = {
                "type": "calculation_error",
                "id": message.get("id"),
                "expression": expression,
                "error": str(e),
            }

        self.send_to_server(response)

    def handle_shutdown(self, message: Dict[str, Any]):
        """处理来自服务器的关闭消息"""
        logger.info("收到服务器关闭请求")
        self.running = False

        # 发送关闭确认
        response = {
            "type": "shutdown_ack",
            "id": message.get("id"),
            "message": "Client shutting down",
        }
        self.send_to_server(response)

    def handle_server_ready(self, message: Dict[str, Any]):
        """处理服务器就绪消息"""
        logger.info(f"服务器就绪: {message.get('message')}")
        logger.info(f"支持的消息类型: {message.get('supported_types')}")

        # 可以在这里发送客户端就绪消息
        self.send_to_server(
            {
                "type": "client_ready",
                "message": "Client is ready to receive messages",
                "capabilities": ["ping", "echo", "calculate", "shutdown"],
            }
        )

    def handle_asr_result(self, message: Dict[str, Any]):
        """处理服务器就绪消息"""
        logger.info(f"服务器就绪: {message.get('method')}")
        logger.info(f"支持的消息类型: {message.get('params')}")

        # 解析 message 中的 text 字段
        params = message.get("params", {})
        recognized_text = params.get("text", "")
        device_id = params.get("device_id", "")

        logger.info(f"ASR识别结果: {recognized_text}")

        async def _run_and_consume():
            handler = self.agent.run(user_input=recognized_text)
            async for ev in handler.stream_events():
                if isinstance(ev, FuncCallEvent):
                    obj = {
                        "tool_name": ev.tool_name,
                        "tool_kwargs": ev.tool_kwargs,
                    }
                    if ev.tool_output is not None:
                        obj["tool_output"] = ev.tool_output
                    self.send_to_server(
                        {
                            "jsonrpc": "2.0",
                            "id": self.unique_id,
                            "method": "mcp_tool_calling",
                            "obj": {
                                "tool_name": ev.tool_name,
                                "tool_kwargs": ev.tool_kwargs,
                            },
                        }
                    )
                elif isinstance(ev, MessageEvent):
                    self.send_to_server(
                        [
                            {
                                "jsonrpc": "2.0",
                                "id": 1,
                                "method": "tts_and_send",
                                "params": {
                                    "device_id": device_id,
                                    "task_id": "aaa",
                                    "text": ev.message,
                                },
                            }
                        ]
                    )
                    self.send_to_server(
                        {
                            "jsonrpc": "2.0",
                            "id": self.unique_id,
                            "method": "tts_and_send_finish",
                            "params": {"device_id": device_id, "task_id": "aaa"},
                        }
                    )

        asyncio.run(_run_and_consume())

        # 可以在这里发送客户端就绪消息
        # self.send_to_server(
        #     {
        #         "type": "client_ready",
        #         "message": "Client is ready to receive messages",
        #         "capabilities": ["ping", "echo", "calculate", "shutdown"],
        #     }
        # )

    # def send_to_server(self, message: Dict[str, Any]) -> bool:
    #     """
    #     向服务器发送消息

    #     Args:
    #         message: 要发送的消息字典

    #     Returns:
    #         bool: 发送是否成功
    #     """
    #     try:
    #         # 添加消息 ID
    #         if "id" not in message:
    #             self.message_id_counter += 1
    #             message["id"] = self.message_id_counter

    #         # 序列化并发送消息到标准输出（服务器会从标准输入读取）
    #         json_message = json.dumps(message, ensure_ascii=False)
    #         print(json_message, flush=True)

    #         logger.info(f"发送到服务器: {json_message}")
    #         return True

    #     except Exception as e:
    #         logger.error(f"发送到服务器失败: {e}")
    #         return False

    def send_to_server(self, message) -> bool:
        """
        向服务器发送消息

        Args:
            message: 要发送的消息（可以是 dict 或 list）

        Returns:
            bool: 发送是否成功
        """
        try:
            # 如果是 dict，自动添加消息 ID
            if isinstance(message, dict):
                if "id" not in message:
                    self.message_id_counter += 1
                    message["id"] = self.message_id_counter
            # 如果是 list，遍历每个元素，自动添加消息 ID
            elif isinstance(message, list):
                for item in message:
                    if isinstance(item, dict) and "id" not in item:
                        self.message_id_counter += 1
                        item["id"] = self.message_id_counter

            # 序列化并发送消息到标准输出（服务器会从标准输入读取）
            json_message = json.dumps(message, ensure_ascii=False)
            print(json_message, flush=True)

            logger.info(f"发送到服务器: {json_message}")
            return True

        except Exception as e:
            logger.error(f"发送到服务器失败: {e}")
            return False

    def receive_from_server(self) -> Union[Dict[str, Any], List[Any]]:
        """
        从服务器接收消息

        Returns:
            Union[Dict[str, Any], List[Any]]: 接收到的消息，可能是字典或数组
        """
        try:
            # 从标准输入读取（服务器写入到标准输出）
            line = input().strip()
            if line:
                message = json.loads(line)
                logger.info(f"从服务器接收: {message}")
                # 判断返回类型
                if isinstance(message, dict) or isinstance(message, list):
                    return message
                else:
                    logger.error(f"未知的消息类型: {type(message)}")
                    return {"type": "error", "message": "Unknown message type"}
            return {}

        except EOFError:
            logger.info("服务器断开连接")
            return {"type": "shutdown"}
        except json.JSONDecodeError as e:
            logger.error(f"JSON 解析失败: {e}")
            return {"type": "error", "message": "Invalid JSON"}
        except Exception as e:
            logger.error(f"从服务器接收消息失败: {e}")
            return {"type": "error", "message": str(e)}

    def start(self):
        """启动客户端"""
        try:
            logger.info("stdio 客户端启动（被服务器启动模式）")

            if self.launched_by_server:
                logger.info(f"被服务器启动，服务器 PID: {self.server_pid}")
            else:
                logger.info("独立启动模式")

            import uuid

            self.unique_id = str(uuid.uuid4())

            # 发送客户端就绪消息
            self.send_to_server(
                {
                    "jsonrpc": "2.0",
                    "id": self.unique_id,
                    "method": "init",
                    "params": {
                        "protocol_version": "1.0",
                        "configs": {"asr": {"auto_merge": True}},
                    },
                }
            )

            # 启动接收线程
            self.running = True
            receive_thread = threading.Thread(target=self._receive_loop, daemon=True)
            receive_thread.start()

            logger.info("客户端启动完成，等待服务器消息...")
            return True

        except Exception as e:
            logger.error(f"启动客户端失败: {e}")
            return False

    def _receive_loop(self):
        """接收消息的主循环"""
        while self.running:
            try:
                message = self.receive_from_server()

                if not message:
                    continue

                # 如果 message 是数组，取第一个元素作为消息体
                if isinstance(message, list):
                    if len(message) == 0:
                        continue
                    message = message[0]
                    if not isinstance(message, dict):
                        logger.error(f"消息数组的第一个元素不是字典: {message}")
                        continue

                if not isinstance(message, dict):
                    logger.error(f"收到的消息不是字典类型: {message}")
                    continue

                # 处理带有 "method" 字段的消息，其他忽略
                message_type = message.get("method")
                if message_type is None:
                    continue

                if message_type in self.message_handlers:
                    # 调用相应的消息处理器
                    self.message_handlers[message_type](message)
                elif message_type == "shutdown":
                    logger.info("收到关闭信号")
                    break
                elif message_type == "error":
                    logger.error(f"服务器错误: {message.get('message')}")
                else:
                    logger.warning(f"未知的消息类型: {message_type}")

            except Exception as e:
                logger.error(f"处理消息时发生错误: {e}")
                break

        self.running = False
        logger.info("客户端接收循环结束")

    def stop(self):
        """停止客户端"""
        logger.info("正在停止客户端...")
        self.running = False

    def run(self):
        """运行客户端主循环"""
        try:
            if not self.start():
                logger.error("客户端启动失败")
                return

            # 主循环 - 保持客户端运行
            while self.running:
                try:
                    time.sleep(0.1)  # 避免 CPU 占用过高

                    # 检查是否应该退出
                    if not self.running:
                        break

                except KeyboardInterrupt:
                    logger.info("收到中断信号")
                    break
                except Exception as e:
                    logger.error(f"主循环中发生错误: {e}")
                    break

        except KeyboardInterrupt:
            logger.info("收到中断信号")
        except Exception as e:
            logger.error(f"运行时发生错误: {e}")
        finally:
            self.stop()
            logger.info("客户端已停止")


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
    """主函数"""
    client = StdioClientForServer()

    try:
        # 初始化 MCP 客户端和对话代理
        # 假设 mcp_client_init.py 在同目录或已在 PYTHONPATH
        client.agent = create_agent()
        client.run()
    except Exception as e:
        logger.error(f"客户端运行失败: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
