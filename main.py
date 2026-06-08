from langchain_google_genai import GoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnableLambda
from langchain_core.runnables import RunnablePassthrough
from langchain_core.runnables import RunnableParallel
from langchain_core.runnables import RunnableSequence

from dotenv import load_dotenv
import os

load_dotenv()

gemini_api_key = os.getenv("GEMINI_API_KEY")
print(gemini_api_key)

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