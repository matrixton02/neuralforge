import os
from pathlib import Path
from dotenv import load_dotenv

PROJECT_ROOT=Path(__file__).resolve().parent.parent

load_dotenv(PROJECT_ROOT/".env")

MODAL_BASE_URL=os.getenv("MODAL_BASE_URL")

VLLM_API_KEY=os.getenv("VLLM_API_KEY")

MODEL_NAME=os.getenv("MODEL_NAME")

MODEL_MOCK=os.getenv("MODEL_MOCK").lower()=="true"

SYSTEM_PROMPT="""You are a helpful AI assistant.
Provide accurate, clear, and well-structured responses.
For technical questions, explain concepts step by step."""

MAX_HISTORY_MESSAGE=40

SESSION_DIR=PROJECT_ROOT/"storage"/"sessions"
SESSION_DIR.mkdir(parents=True,exist_ok=True)