from langchain_core import embeddings
from langchain_google_genai import GoogleGenerativeAI,GoogleGenerativeAIEmbeddings
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnableLambda
from langchain_core.runnables import RunnablePassthrough
from langchain_core.runnables import RunnableParallel
from langchain_core.runnables import RunnableSequence
from langchain_text_splitters import RecursiveCharacterTextSplitter

from youtube_transcript_api import YouTubeTranscriptApi
from urllib.parse import urlparse, parse_qs

from dotenv import load_dotenv
import os

load_dotenv()

gemini_api_key = os.getenv("GEMINI_API_KEY")

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

yt_url = "https://www.youtube.com/watch?v=6iztuIGwahk"
video_id = parse_qs(urlparse(yt_url).query)["v"][0]
yt_transcript = YouTubeTranscriptApi().fetch(video_id , languages=['hi'])

text = "\n".join([i.text for i in yt_transcript])
# print(text)

splitter = RecursiveCharacterTextSplitter(
    chunk_size = 1000,
    chunk_overlap = 200
)

chunks = splitter.split_text(text)

# print(len(chunks))
# print(chunks[0])

embeddingsGen = GoogleGenerativeAIEmbeddings(
    model="models/gemini-embedding-001"
)

embeddingsContext = embeddingsGen.embed_documents(chunks)

# print(len(embeddingsContext))
# print(embeddingsContext[0])