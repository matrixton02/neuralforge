import json
import uuid
import re

from datetime import datetime,timezone
from pathlib import Path

from backend.config import SESSION_DIR

class SessionManager:
    def __init__(self):
        self.storage_dir=Path(SESSION_DIR)
        self.storage_dir.mkdir(parents=True,exist_ok=True)

    def _get_path(self,session_id):
        if not re.fullmatch(r"[a-z0-9]{32}",session_id):
            raise FileNotFoundError("Invalid Session ID")

        return self.storage_dir/f"{session_id}.jsonl"

    def create_session(self):
        session_id=uuid.uuid4().hex
        self._get_path(session_id).touch()

        return session_id

    def apppend_message(self,session_id,roles,content):
        path=self._get_path(session_id)

        if not path.exists():
            raise FileNotFoundError("Session not found.")

        message={
            "roles":roles,
            "content":content,
            "timestamp":datetime.now(timezone.utc).isoformat()
        }

        with path.open("a",encoding="utf-8") as file:
            file.write(json.dumps(message,ensure_ascii=False)+"\n")

    def get_message(self,session_id):
        path=self._get_path(session_id)

        if not path.exists():
            raise FileNotFoundError("Session not found.")

        messages=[]

        with path.open("r",encoding="utf-8") as file:
            for line in file:
                if line.strip():
                    messages.append(json.loads(line))

        return messages

    def list_sessions(self):
        sessions=[]

        for path in self.storage_dir.glob("*.jsonl"):
            try:
                session_id=path.stem
                messages=self.get_message(session_id)

                first_user_message=next(
                    (
                        message.get("content", "")
                        for message in messages
                        if isinstance(message, dict)
                        and message.get("role") == "user"
                        and isinstance(message.get("content"), str)
                    ),
                    "New conversation"
                )

                last_timestamp = next(
                    (
                        message.get("timestamp")
                        for message in reversed(messages)
                        if isinstance(message, dict)
                        and message.get("timestamp")
                    ),
                    None
            )

                sessions.append({
                    "session_id":session_id,
                    "title":first_user_message[:60],
                    "message_count":len(messages),
                    "updated_at":last_timestamp
                })
            except (FileNotFoundError, json.JSONDecodeError, OSError) as error:
                print(f"Skipping invalid session {path.name}: {error}")
                continue    

        sessions.sort(
            key=lambda session: session["updated_at"] or "",
            reverse=True
        )

        return sessions

    def delete_session(self,session_id):
        path=self._get_path(session_id)

        if not path.exists():
            raise FileNotFoundError("Session not found.")

        path.unlink()

session_manager=SessionManager()