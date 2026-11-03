import asyncio
import json
import logging

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from backend.config import PROJECT_ROOT
from backend.session_manager import session_manager
from backend.model_client import generate_response, stream_response

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Cloud LLM Platform",
    description="A cloud-hosted LLM inference and conversation management platform",
    version="1.1.0",
)
FRONTEND_DIR = PROJECT_ROOT / "frontend"
app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    session_id: str | None = None
    message: str = Field(min_length=1, max_length=20000)


@app.get("/")
async def root():
    return FileResponse(FRONTEND_DIR / "index.html")


@app.get("/api/healthy")
async def health():
    return {"status": "healthy", "service": "FastAPI backend"}


@app.post("/api/sessions")
async def create_session():
    session_id = session_manager.create_session()
    return {"session_id": session_id, "message": "Session created successfully"}


@app.get("/api/sessions")
async def list_sessions():
    return {"sessions": session_manager.list_sessions()}


@app.get("/api/sessions/{session_id}")
async def get_session(session_id: str):
    try:
        return {"session_id": session_id, "messages": session_manager.get_message(session_id)}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Session not found.")


@app.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str):
    try:
        session_manager.delete_session(session_id)
        return {"message": "Session deleted successfully"}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Session not found.")


@app.post("/api/chat")
async def chat(request: ChatRequest):
    """Non-streaming endpoint retained for compatibility."""
    session_id = request.session_id or session_manager.create_session()
    try:
        conversation = session_manager.get_message(session_id)
        session_manager.append_message(session_id, "user", request.message)
        conversation.append({"role": "user", "content": request.message})
        answer, usage = await generate_response(conversation)
        session_manager.append_message(session_id, "assistant", answer)
        return {"session_id": session_id, "response": answer, "usage": usage}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Session not found.")
    except Exception:
        logger.exception("Non-streaming chat generation failed.")
        raise HTTPException(status_code=502, detail="Modal inference failed. Check the backend logs.")


@app.post("/api/chat/stream")
async def chat_stream(request: ChatRequest):
    session_id=request.session_id or session_manager.create_session()

    try:
        conversation=session_manager.get_message(session_id)
        session_manager.append_message(session_id,"user",request.message)
        conversation.append({"role":"user","content":request.message})
    except FileNotFoundError:
        raise HTTPException(status_code=404,detail="Session not found.")

    async def event_stream():
        answer_parts=[]
        usage=None
        ompleted=False
        try:
            async for item in stream_response(conversation):
                if item["type"]=="token":
                    answer_parts.append(item["content"])
                    yield f"data: {json.dumps(item, ensure_ascii=False)}\n\n"
                elif item["type"]=="usage":
                    usage=item["usage"]

            completed=True
            full_answer="".join(answer_parts)
            if full_answer:
                session_manager.append_message(session_id,"assistant",full_answer)

            payload={"type":"done","session_id":session_id,"usage":usage}
            yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

        except asyncio.CancelledError:
            logger.info("Client disconnected; generation cancelled for session %s", session_id)
            raise
        except Exception:
            logger.exception("Streaming chat generation failed.")
            payload = {"type": "error", "message": "Model inference failed. Check the backend logs."}
            yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

        finally:
            # Keep useful partial output if generation was stopped or interrupted.
            partial_answer = "".join(answer_parts)
            if partial_answer and not completed:
                try:
                    session_manager.append_message(session_id, "assistant", partial_answer)
                except Exception:
                    logger.exception("Could not persist interrupted response.")

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )