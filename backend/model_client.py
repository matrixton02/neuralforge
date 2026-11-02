from openai import AsyncOpenAI

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
    if not VLLM_API_KEY:
        raise RuntimeError("VLLM_API_KEY is missing from ,env")

    client=AsyncOpenAI(
        base_url=MODAL_BASE_URL,
        api_key=VLLM_API_KEY,
        timeout=300.0
    )

async def generate_response(conversation):

    if MODEL_MOCK:

        return(
            "This is a mock response from the local backend. "
            "Your session management and API routes are working! "
            "Real Qwen inference will be enabled when we reconnect to Modal."
        ),None

    history=conversation[-MAX_HISTORY_MESSAGE:]

    messages=[
        {"role":"system","content":SYSTEM_PROMPT}
    ]

    messages.extend([
        {
            "role":message["role"],
            "content":message["content"]
        }
        for message in history
    ])

    response=await client.chat.completions.create(
        model=MODEL_NAME,
        messages=messages,
        temperature=0.7,
        max_tokens=512
    )

    answer=response.choices[0].message.content

    usage=None
    if response.usage:
        usage={
            "prompt_tokens":response.usage.prompt_tokens,
            "compltetion_tokens":response.usage.completion_tokens,
            "total_tokens":response.usage.total_tokens
        }

    return answer,usage