from pinecone import Pinecone
import os
from dotenv import load_dotenv

load_dotenv()
from pinecone import Pinecone, ServerlessSpec

pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))

pc.create_index(
    name="yt-rag-chat",
    dimension=3072,   # use your actual dimension
    metric="cosine",
    spec=ServerlessSpec(
        cloud="aws",
        region="us-east-1"
    )
)