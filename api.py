"""
FastAPI server for YouTube Video RAG Chat.
Wraps core.py functions as REST endpoints for the Chrome extension.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import traceback

from core import process_video, ask_question, extract_video_id

# ── App setup ──────────────────────────────────────────────────────────────────

app = FastAPI(
    title="YouTube RAG Chat API",
    description="API for processing YouTube video transcripts and answering questions",
    version="1.0.0"
)

# Allow Chrome extension to call the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request / Response models ─────────────────────────────────────────────────

class ProcessRequest(BaseModel):
    video_url: str


class ProcessResponse(BaseModel):
    video_id: str
    status: str
    chunk_count: int


class AskRequest(BaseModel):
    video_id: str
    question: str


class AskResponse(BaseModel):
    answer: str


# ── Endpoints ──────────────────────────────────────────────────────────────────

@app.post("/api/process", response_model=ProcessResponse)
async def process_endpoint(request: ProcessRequest):
    """
    Process a YouTube video: fetch transcript → chunk → embed → store in Pinecone.
    """
    try:
        result = process_video(request.video_url)
        return ProcessResponse(**result)
    except KeyError:
        raise HTTPException(
            status_code=400,
            detail="Invalid YouTube URL. Could not extract video ID."
        )
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Error processing video: {str(e)}"
        )


@app.post("/api/ask", response_model=AskResponse)
async def ask_endpoint(request: AskRequest):
    """
    Ask a question about a processed video.
    """
    try:
        answer = ask_question(request.video_id, request.question)
        return AskResponse(answer=answer)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Error generating answer: {str(e)}"
        )


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok"}
