"""
Core logic for YouTube Video RAG Chat.
Extracted from main.py — all logic is identical, just organized as reusable functions.
main.py remains untouched.
"""

from langchain_google_genai import GoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnableLambda, RunnablePassthrough, RunnableParallel
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_pinecone import PineconeVectorStore

from pinecone import Pinecone
from youtube_transcript_api import YouTubeTranscriptApi
from urllib.parse import urlparse, parse_qs

from dotenv import load_dotenv
import os

load_dotenv()

# ── Model & Pinecone setup (same as main.py) ──────────────────────────────────

gemini_api_key = os.getenv("GEMINI_API_KEY")
pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))

llm = GoogleGenerativeAI(model="gemini-2.5-flash", google_api_key=gemini_api_key)

embeddings_gen = GoogleGenerativeAIEmbeddings(
    model="models/gemini-embedding-001"
)

index = pc.Index("yt-rag-chat")

# ── In-memory cache of processed video IDs ─────────────────────────────────────

_processed_videos: dict[str, int] = {}  # video_id -> chunk_count


# ── Helper functions (same logic as main.py) ───────────────────────────────────

def extract_video_id(url: str) -> str:
    """Parse a YouTube URL and return the video ID."""
    return parse_qs(urlparse(url).query)["v"][0]


def fetch_transcript(video_id: str) -> str:
    """Fetch the transcript for a YouTube video and join into a single string.
    Tries all available languages (not just English) so Hindi, Spanish, etc. work too.
    """
    ytt = YouTubeTranscriptApi()
    try:
        # Try English first
        yt_transcript = ytt.fetch(video_id, languages=["en"])
    except Exception:
        # Fallback: list available transcripts and grab whichever is available
        transcript_list = ytt.list(video_id)
        available = list(transcript_list)
        if not available:
            raise ValueError(f"No transcripts available for video {video_id}")
        # Pick the first available transcript (auto-generated or manual)
        yt_transcript = available[0].fetch()
    text = "\n".join([snippet.text for snippet in yt_transcript])
    return text


def chunk_text(text: str) -> list[str]:
    """Split text into chunks using RecursiveCharacterTextSplitter."""
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200
    )
    return splitter.split_text(text)


def get_vector_store() -> PineconeVectorStore:
    """Return the configured Pinecone vector store."""
    return PineconeVectorStore(
        index=index,
        embedding=embeddings_gen
    )


# ── Main pipeline functions ────────────────────────────────────────────────────

def process_video(video_url: str) -> dict:
    """
    Full pipeline: extract video ID → fetch transcript → chunk → embed → store.
    Returns metadata about the processed video.
    Skips re-processing if the video was already processed in this session.
    """
    video_id = extract_video_id(video_url)

    # Check cache — skip if already processed
    if video_id in _processed_videos:
        return {
            "video_id": video_id,
            "status": "already_processed",
            "chunk_count": _processed_videos[video_id]
        }

    # Fetch and chunk transcript
    text = fetch_transcript(video_id)
    chunks = chunk_text(text)

    # Delete old vectors for this video, then add new ones (same as main.py)
    try:
        index.delete(
            filter={"video_id": video_id}
        )
    except Exception:
        # Namespace may not exist yet on a fresh index — safe to ignore
        pass

    vector_store = get_vector_store()
    vector_store.add_texts(chunks)

    # Cache the result
    _processed_videos[video_id] = len(chunks)

    return {
        "video_id": video_id,
        "status": "processed",
        "chunk_count": len(chunks)
    }


def ask_question(video_id: str, question: str) -> str:
    """
    Retrieve relevant context from Pinecone and generate an answer via Gemini.
    Uses the exact same prompt template and chain as main.py.
    """
    vector_store = get_vector_store()
    retrieval = vector_store.as_retriever()

    prompt = ChatPromptTemplate.from_template("""
    You are a helpful AI assistant.

    Answer the user's question using ONLY the provided context.

    If the answer is not present in the context, say:
    "I couldn't find that information in the video."

    Context:
    {context}

    Question:
    {question}

    Answer:
""")

    def format_doc(docs):
        return "\n\n".join(doc.page_content for doc in docs)

    chain = (
        RunnableParallel({
            "context": retrieval | RunnableLambda(format_doc),
            "question": RunnablePassthrough()
        })
        | prompt
        | llm
        | StrOutputParser()
    )

    response = chain.invoke(question)
    return response
