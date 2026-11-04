from openai import AsyncOpenAI
import asyncio

from backend.config import(
    MODAL_BASE_URL,
    VLLM_API_KEY,
    MODEL_NAME,
    MODEL_MOCK,
    SYSTEM_PROMPT,
    MAX_HISTORY_MESSAGE
)

client=None

if not MODEL_MOCK:
    if not MODAL_BASE_URL:
        raise RuntimeError("MODAL_BASE_URL is missing from .env")
    if not VLLM_API_KEY:
        raise RuntimeError("VLLM_API_KEY is missing from .env")
    if not MODEL_NAME:
        raise RuntimeError("MODEL_NAME is missing from .env")

    client=AsyncOpenAI(
        base_url=MODAL_BASE_URL,
        api_key=VLLM_API_KEY,
        timeout=300.0
    )


def _prepare_messages(conversation):
    messages=[{"role":"system","content":SYSTEM_PROMPT}]
    for message in conversation[-MAX_HISTORY_MESSAGE:]:
        if not isinstance(message,dict):
            continue

        role=message.get("role") or message.get("roles")
        content=message.get("content")

        if role in ("user","assistant") and isinstance(content,str):
            messages.append({"role":role,"content":content})

    return messages

async def generate_response(conversation):

    if MODEL_MOCK:

        return(
            "This is a mock response from the local backend. "
            "Your session management and API routes are working! "
            "Real Qwen inference will be enabled when we reconnect to Modal."
        ),None

    response = await client.chat.completions.create(
        model=MODEL_NAME,
        messages=_prepare_messages(conversation),
        temperature=0.7,
        max_tokens=2048,
    )
    answer = response.choices[0].message.content or ""
    usage = None
    if response.usage:
        usage = {
            "prompt_tokens": response.usage.prompt_tokens,
            "completion_tokens": response.usage.completion_tokens,
            "total_tokens": response.usage.total_tokens,
        }
    return answer, usage

async def stream_response(conversation):
    """Yield token and usage events; mock mode also streams for local testing."""
    if MODEL_MOCK:
        mock_text = (
            "This is a **streaming mock response** from NeuralForge. "
            "The browser should display this text progressively, rather than "
            "waiting for the complete response.\n\n"
            "```python\ndef kalman_update(state, measurement):\n"
            "    return state + 0.5 * (measurement - state)\n```"
        )
        for start in range(0, len(mock_text), 9):
            await asyncio.sleep(0.035)
            yield {"type": "token", "content": mock_text[start:start + 9]}
        yield {"type": "usage", "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}}
        return

    stream = await client.chat.completions.create(
        model=MODEL_NAME,
        messages=_prepare_messages(conversation),
        temperature=0.7,
        max_tokens=2048,
        stream=True,
        stream_options={"include_usage": True},
    )

    async for chunk in stream:
        if chunk.usage is not None:
            yield {
                "type": "usage",
                "usage": {
                    "prompt_tokens": chunk.usage.prompt_tokens,
                    "completion_tokens": chunk.usage.completion_tokens,
                    "total_tokens": chunk.usage.total_tokens,
                },
            }
        if not chunk.choices:
            continue
        content = getattr(chunk.choices[0].delta, "content", None)
        if content:
            yield {"type": "token", "content": content}