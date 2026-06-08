from langchain_core import embeddings
from langchain_google_genai import GoogleGenerativeAI,GoogleGenerativeAIEmbeddings
from langchain_core.prompts import ChatPromptTemplate, PromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnableLambda
from langchain_core.runnables import RunnablePassthrough
from langchain_core.runnables import RunnableParallel
from langchain_core.runnables import RunnableSequence
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_pinecone import PineconeVectorStore


from pinecone import Pinecone,ServerlessSpec
from youtube_transcript_api import YouTubeTranscriptApi
from urllib.parse import urlparse, parse_qs

from dotenv import load_dotenv
import os

load_dotenv()

gemini_api_key = os.getenv("GEMINI_API_KEY")
pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))

llm = GoogleGenerativeAI(model = "gemini-2.5-flash", google_api_key = gemini_api_key)

# prompt = ChatPromptTemplate.from_messages([
#     ("system", "You are a helpful assistant that can answer questions and help with tasks."),
#     ("user", "{input}"),
# ])

# chain = RunnableSequence(
#     prompt,
#     llm,
#     StrOutputParser(),
# )

# result = chain.invoke({
#     "input": "What is the capital of France?"
# })

# print(result)

def get_url():
    # yt_url = "https://www.youtube.com/watch?v=7nb3gdchiKA"
    yt_url = input("Give me video URL: ")

    return yt_url

yt_url = get_url()
# yt_url = input("Give me yt url then you can see magic :)")



video_id = parse_qs(urlparse(yt_url).query)["v"][0]
yt_transcript =  YouTubeTranscriptApi().fetch(video_id)

text  = "\n".join([i.text for i in yt_transcript])



# print(text)

def get_chunk(text):
    splitter = RecursiveCharacterTextSplitter(
        chunk_size = 1000,
        chunk_overlap = 200
    )

    chunks = splitter.split_text(text)

    return chunks

chunks  = get_chunk(text)
# print(len(chunks))
# print(chunks[0])

embeddingsGen = GoogleGenerativeAIEmbeddings(
    model="models/gemini-embedding-001"
)

# embeddingsContext = embeddingsGen.embed_documents(chunks)

# print(len(embeddingsContext))
# print(embeddingsContext[0])



index = pc.Index("yt-rag-chat")

vectore_store = PineconeVectorStore(
    index  = index,
    embedding = embeddingsGen
)

index.delete(
    filter={
        "video_id": video_id
    }
)


vectore_store.add_texts(chunks)



retrieval = vectore_store.as_retriever()

query = input("Ask Question about the video: ")



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
        "context" : retrieval | RunnableLambda(format_doc),
        "question" : RunnablePassthrough()
    })
    | prompt
    | llm
    | StrOutputParser()
)

response = chain.invoke(query)

print(response)