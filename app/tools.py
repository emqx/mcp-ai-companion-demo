import os
from openai import OpenAI
from llama_index.core.tools import ToolOutput

api_key = os.environ.get("DASHSCOPE_API_KEY")


def process_tool_output(response_text):
    if hasattr(response_text, "content"):
        response_text = response_text.content
        return response_text
    return None


def explain_photo(image_url: str, question: str) -> str:
    """Explain the photo by the question. Used when users ask a question about the photo. The image_url is the url of the image."""

    request_body = {
        "role": "user",
        "content": [
            {
                "type": "image_url",
                "image_url": {"url": image_url},
            },
            {"type": "text", "text": question},
        ],
    }

    client = OpenAI(
        api_key=api_key,
        base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
    )
    completion = client.chat.completions.create(
        model="qwen-vl-plus",
        messages=[request_body],
    )
    content = ""
    if completion.choices and hasattr(completion.choices[0], "message"):
        content = completion.choices[0].message.content
    return content


async def explain_photo_async(image_url: str, question: str) -> str:
    """Explain the photo by the question asynchronously. Used when users ask a question about the photo. The image_url is the url of the image."""
    return explain_photo(image_url, question)


def get_first_text_from_tool_output(tool_output: ToolOutput) -> str:
    if tool_output is None or not hasattr(tool_output, "content"):
        return ""
    if hasattr(tool_output, "raw_output") and hasattr(
        tool_output.raw_output, "content"
    ):
        content = tool_output.raw_output.content
        if isinstance(content, list):
            for item in content:
                if hasattr(item, "type") and hasattr(item, "text"):
                    return item.text
    return ""
