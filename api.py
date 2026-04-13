"""
FastAPI backend for the Mistral 7B RAG chatbot.
Wraps llama_rag_bot.py and exposes /status, /upload, and /chat endpoints.
"""

import os
import shutil
import threading
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from llama_rag_bot import build_rag_index, ask_bot

# ─────────────────────────────────────────────
# App setup
# ─────────────────────────────────────────────
app = FastAPI(title="RAG Chatbot API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],       # open for local file:// access
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────
# Global state
# ─────────────────────────────────────────────
_index = None
_ready = False
_error: str | None = None
_current_pdf: str = "parallel_programs.pdf"
_index_lock = threading.Lock()

UPLOAD_DIR = os.path.dirname(os.path.abspath(__file__))


def _load_index(pdf_path: str):
    """Load/reload the RAG index in a background thread."""
    global _index, _ready, _error, _current_pdf
    with _index_lock:
        _ready = False
        _error = None
        try:
            print(f"[api] Building RAG index for: {pdf_path} ...")
            _index = build_rag_index(pdf_path)
            _current_pdf = os.path.basename(pdf_path)
            _ready = True
            print("[api] RAG index ready ✓")
        except Exception as exc:
            _error = str(exc)
            print(f"[api] Failed to build RAG index: {exc}")


@app.on_event("startup")
def startup_event():
    t = threading.Thread(target=_load_index, args=("parallel_programs.pdf",), daemon=True)
    t.start()


# ─────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────
class ChatRequest(BaseModel):
    question: str


class ChatResponse(BaseModel):
    answer: str


@app.get("/status")
def status():
    """Returns whether the RAG index is ready and which PDF is loaded."""
    return {"ready": _ready, "error": _error, "pdf": _current_pdf}


@app.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    """Upload a PDF, save it, and kick off re-indexing in the background."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    save_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(save_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    print(f"[api] Received new PDF: {file.filename} — starting re-index...")
    t = threading.Thread(target=_load_index, args=(save_path,), daemon=True)
    t.start()

    return {"message": f"Uploaded '{file.filename}'. Re-indexing started.", "pdf": file.filename}


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    if not _ready:
        if _error:
            raise HTTPException(status_code=500, detail=f"Index failed to load: {_error}")
        raise HTTPException(status_code=503, detail="Model is still loading. Please wait.")

    if not req.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    response = ask_bot(_index, req.question)
    return ChatResponse(answer=str(response))

