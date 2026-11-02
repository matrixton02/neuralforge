import logging

from fastapi import FastAPI,HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel,Field

from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.config import PROJECT_ROOT
from backend.session_manager import session_manager
from backend.model_client import generate_response

logging.basicConfig(level=logging.INFO)
logger=logging.getLogger(__name__)

app=FastAPI(
    title="Cloud LLM Platform",
    description="A cloud-hosted LLM inference and conversation management platform",
    version="1.0.0"
)

FRONTEND_DIR = PROJECT_ROOT / "frontend"

app.mount(
    "/static",
    StaticFiles(directory=FRONTEND_DIR),
    name="static"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"]
)

class ChatRequest(BaseModel):
    session_id:str|None=None
    message:str=Field(min_length=1,max_length=20000)

@app.get("/")
async def root():
    return FileResponse(FRONTEND_DIR / "index.html")

@app.get("/api/healthy")
async def health():
    return{
        "status":"healthy",
        "service":"FastAPI backend"
    }

@app.post("/api/sessions")
async def create_session():
    session_id=session_manager.create_session()

    return {
        "session_id":session_id,
        "message":"Session crated successfully"
    }

@app.get("/api/sessions")
async def list_sessions():
    return {
        "sessions":session_manager.list_sessions()
    }

@app.get("/api/sessions/{session_id}")
async def get_session(session_id:str):
    try:
        messages=session_manager.get_message(session_id)

        return {
            "session_id":session_id,
            "messages":messages
        }
    except FileNotFoundError:
        raise HTTPException(
            status_code=404,
            detail="Session not found."
        )

@app.delete("/api/sessions/{session_id}")
async def delete_session(session_id:str):
    try:
        session_manager.delete_session(session_id)

        return {
            "messages":"Session deleted successfully"
        }

    except FileNotFoundError:
        raise HTTPException(
            status_code=404,
            detail="Session not found"
        )

@app.post("/api/chat")
async def char(request: ChatRequest):
    session_id=request.session_id

    if session_id is None:
        session_id=session_manager.create_session()

    try:
        conversation=session_manager.get_message(session_id)

        session_manager.apppend_message(
            session_id,
            "user",
            request.message
        )

        conversation.append({
            "role":"user",
            "content":request.message
        })

        answer,usage=await generate_response(conversation)

        session_manager.apppend_message(
            session_id,
            "assistant",
            answer
        )

        return {
            "session_id":session_id,
            "response":answer,
            "usage":usage
        }

    except FileNotFoundError:
        raise HTTPException(
            status_code=404,
            detail="Session not found."
        )

    except Exception:
        logger.exception("Chat generation fialed.")

        raise HTTPException(
            status_code=502,
            detail="Modal inference failed. Check the backend logs."
        )

"""
Method	    Endpoint	        Purpose
GET	    /Backend                status
GET	    /api/health	Health      check
POST	/api/sessions	    Create session
GET	    /api/sessions	    List sessions
GET	    /api/sessions/{id}	Retrieve conversation
DELETE	/api/sessions/{id}	Delete conversation
POST	/api/chat	Send a message
"""