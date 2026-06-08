# YouTube AI Chat Extension

A Chrome extension that adds an AI-powered chat panel to YouTube videos. You can ask questions about the video you are currently watching, and it will answer based on the video's transcript using Gemini 2.5 Flash and Pinecone for vector search.

## 🚀 Features
- **Sidebar Chat Interface:** Injects a clean, modern chat panel directly into YouTube.
- **Context-Aware:** Automatically fetches the video's transcript.
- **Fast Search:** Uses Pinecone to quickly find relevant parts of the video.
- **Smart Answers:** Uses Google's Gemini 2.5 Flash to generate accurate answers based on the transcript.

## 📦 How to Install (For Users)

Since this extension is not yet published on the Chrome Web Store, you can install it manually in Developer Mode.

1. **Download the Extension:**
   - Download the latest `yt-chat-extension-store.zip` from this repository or clone the repository.
   - Unzip the file to a folder on your computer.

2. **Load into Chrome:**
   - Open Google Chrome and go to `chrome://extensions/` in your address bar.
   - Turn on **Developer mode** (the toggle switch in the top right corner).
   - Click the **Load unpacked** button in the top left.
   - Select the `extension` folder you just unzipped.

3. **Use the Extension:**
   - Go to any YouTube video.
   - Click the new **AI Chat** button that appears on the right side of the page to open the panel!

## 🛠️ Backend Setup (For Developers)

The extension requires a Python backend to process transcripts and connect to the AI models.

### Prerequisites
- Python 3.10+
- A [Google Gemini API Key](https://aistudio.google.com/)
- A [Pinecone API Key](https://www.pinecone.io/)

### Local Installation
1. Clone this repository:
   ```bash
   git clone https://github.com/mkuldeepsinh/yt-chat-chrome-extention.git
   cd yt-chat-chrome-extention
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Set up environment variables:
   Create a `.env` file in the root directory and add your keys:
   ```env
   GEMINI_API_KEY=your_gemini_key_here
   PINECONE_API_KEY=your_pinecone_key_here
   ```

4. Run the server:
   ```bash
   python run.py
   ```
   The backend will start running on `http://localhost:8000`. 
   
*(Note: If you run locally, make sure the `API_BASE` variable in `extension/content.js` is set to `http://localhost:8000`)*

## ☁️ Deployment

This backend is configured to be easily deployed on services like **Railway** or **Render**.

- **Railway:** Connect your GitHub repo. The included `Procfile` and `run.py` will automatically start the server. Just make sure to add `GEMINI_API_KEY` and `PINECONE_API_KEY` in the Variables tab in your Railway dashboard.

---
*Created by [mkuldeepsinh]*
