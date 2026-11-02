
import os
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

client = OpenAI(
    base_url=os.environ["MODAL_BASE_URL"],
    api_key=os.environ["VLLM_API_KEY"]
)

print("Sending request to Qwen on Modal...")

response = client.chat.completions.create(
    model="qwen2.5-7b",
    messages=[
        {
            "role": "system",
            "content": "You are a helpful technical assistant."
        },
        {
            "role": "user",
            "content": "Explain how a Kalman filter works."
        }
    ],
    max_tokens=300,
    temperature=0.7
)

print("\nQwen response:\n")
print(response.choices[0].message.content)

print("\nUsage:")
print(response.usage)
