/**
 * Content script for YT Chat extension.
 * Injected into YouTube pages. Creates and manages the side chat panel.
 */

(() => {
  // Prevent double injection
  if (window.__ytChatInjected) return;
  window.__ytChatInjected = true;

  const API_BASE = "https://web-production-2be94.up.railway.app";
  const PANEL_WIDTH = 420;

  let panelEl = null;
  let panelOpen = false;
  let currentVideoId = null;
  let isProcessing = false;
  let isAskingQuestion = false;
  let chatHistory = [];

  // ── Utility ───────────────────────────────────────────────────────────────

  function getVideoIdFromUrl(url) {
    try {
      const u = new URL(url);
      return u.searchParams.get("v");
    } catch {
      return null;
    }
  }

  function getVideoTitle() {
    const titleEl =
      document.querySelector(
        "yt-formatted-string.style-scope.ytd-watch-metadata"
      ) ||
      document.querySelector("h1.title yt-formatted-string") ||
      document.querySelector("#title h1 yt-formatted-string");
    return titleEl ? titleEl.textContent.trim() : "YouTube Video";
  }

  // ── Panel creation ────────────────────────────────────────────────────────

  function createPanel() {
    if (panelEl) return;

    panelEl = document.createElement("div");
    panelEl.id = "yt-chat-panel-root";

    // Shadow DOM so YouTube's styles don't interfere
    const shadow = panelEl.attachShadow({ mode: "open" });

    // Load our styles
    const linkEl = document.createElement("link");
    linkEl.rel = "stylesheet";
    linkEl.href = chrome.runtime.getURL("styles.css");
    shadow.appendChild(linkEl);

    // Load Inter font
    const fontLink = document.createElement("link");
    fontLink.rel = "stylesheet";
    fontLink.href =
      "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap";
    shadow.appendChild(fontLink);

    // Panel container
    const container = document.createElement("div");
    container.className = "yt-chat-panel";
    container.innerHTML = `
      <div class="panel-header">
        <div class="header-left">
          <div class="header-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M9.5 8.5L15.5 12L9.5 15.5V8.5Z" fill="currentColor"/>
              <path d="M20 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V6C22 4.9 21.1 4 20 4ZM20 18H4V6H20V18Z" fill="currentColor"/>
            </svg>
          </div>
          <div class="header-text">
            <span class="header-title">YT Chat</span>
            <span class="header-subtitle" id="yt-chat-video-title">Loading...</span>
          </div>
        </div>
        <button class="close-btn" id="yt-chat-close" aria-label="Close panel">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
          </svg>
        </button>
      </div>

      <div class="panel-status" id="yt-chat-status">
        <div class="status-content">
          <div class="status-spinner"></div>
          <span class="status-text">Analyzing video transcript...</span>
        </div>
      </div>

      <div class="chat-messages" id="yt-chat-messages">
        <div class="welcome-message">
          <div class="welcome-icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
              <path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2ZM20 16H5.17L4 17.17V4H20V16Z" fill="url(#grad1)" opacity="0.8"/>
              <path d="M12 14C12.55 14 13 13.55 13 13V10C13 9.45 12.55 9 12 9C11.45 9 11 9.45 11 10V13C11 13.55 11.45 14 12 14Z" fill="url(#grad1)"/>
              <circle cx="8" cy="11" r="1" fill="url(#grad1)"/>
              <circle cx="16" cy="11" r="1" fill="url(#grad1)"/>
              <defs>
                <linearGradient id="grad1" x1="0" y1="0" x2="24" y2="24">
                  <stop offset="0%" stop-color="#FF4444"/>
                  <stop offset="100%" stop-color="#7C3AED"/>
                </linearGradient>
              </defs>
            </svg>
          </div>
          <h3>Ask anything about this video</h3>
          <p>I'll analyze the transcript and answer your questions using AI.</p>
        </div>
      </div>

      <div class="chat-input-area" id="yt-chat-input-area">
        <div class="input-wrapper">
          <textarea
            id="yt-chat-input"
            placeholder="Ask a question about this video..."
            rows="1"
            disabled
          ></textarea>
          <button id="yt-chat-send" class="send-btn" disabled aria-label="Send message">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" fill="currentColor"/>
            </svg>
          </button>
        </div>
        <span class="input-hint">Press Enter to send • Shift+Enter for new line</span>
      </div>
    `;

    shadow.appendChild(container);
    document.body.appendChild(panelEl);

    // ── Block keyboard events from reaching YouTube ──
    // YouTube captures Space (play/pause), K, J, L, F, M, etc.
    // We stop ALL keyboard events from bubbling out of our panel.
    ["keydown", "keyup", "keypress"].forEach((eventType) => {
      container.addEventListener(eventType, (e) => {
        e.stopPropagation();
      });
    });

    // Also block on the host element itself (Shadow DOM boundary)
    ["keydown", "keyup", "keypress"].forEach((eventType) => {
      panelEl.addEventListener(eventType, (e) => {
        e.stopPropagation();
      });
    });

    // Event listeners
    const closeBtn = shadow.getElementById("yt-chat-close");
    const input = shadow.getElementById("yt-chat-input");
    const sendBtn = shadow.getElementById("yt-chat-send");

    closeBtn.addEventListener("click", () => togglePanel(false));

    sendBtn.addEventListener("click", () => handleSend(shadow));

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend(shadow);
      }
    });

    // Auto-resize textarea
    input.addEventListener("input", () => {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 120) + "px";
    });
  }

  // ── Panel toggle ──────────────────────────────────────────────────────────

  function togglePanel(forceState) {
    createPanel();
    panelOpen = forceState !== undefined ? forceState : !panelOpen;

    const shadow = panelEl.shadowRoot;
    const panel = shadow.querySelector(".yt-chat-panel");

    if (panelOpen) {
      panel.classList.add("open");
      panelEl.style.pointerEvents = "auto";
      onPanelOpen(shadow);
    } else {
      panel.classList.remove("open");
      panelEl.style.pointerEvents = "none";
    }
  }

  // ── Video processing ──────────────────────────────────────────────────────

  async function onPanelOpen(shadow) {
    const videoId = getVideoIdFromUrl(window.location.href);
    if (!videoId) {
      showStatus(shadow, "Navigate to a YouTube video to start chatting.", false);
      return;
    }

    // Update video title
    const titleEl = shadow.getElementById("yt-chat-video-title");
    titleEl.textContent = getVideoTitle();

    // If same video, no need to reprocess
    if (videoId === currentVideoId) return;

    currentVideoId = videoId;
    chatHistory = [];
    clearMessages(shadow);
    await processVideo(shadow, videoId);
  }

  async function processVideo(shadow, videoId) {
    if (isProcessing) return;
    isProcessing = true;

    showStatus(shadow, "Analyzing video transcript...", true);
    disableInput(shadow, true);

    try {
      const response = await fetch(`${API_BASE}/api/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_url: `https://www.youtube.com/watch?v=${videoId}`,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "Failed to process video");
      }

      const data = await response.json();
      hideStatus(shadow);
      disableInput(shadow, false);

      // Show success message
      addSystemMessage(
        shadow,
        `✅ Video processed! ${data.chunk_count} segments analyzed. Ask me anything!`
      );
    } catch (err) {
      showStatus(shadow, `❌ ${err.message}. Is the backend server running?`, false);
      console.error("YT Chat: process error", err);
    } finally {
      isProcessing = false;
    }
  }

  // ── Chat ──────────────────────────────────────────────────────────────────

  async function handleSend(shadow) {
    const input = shadow.getElementById("yt-chat-input");
    const question = input.value.trim();

    if (!question || isAskingQuestion || !currentVideoId) return;

    input.value = "";
    input.style.height = "auto";

    addUserMessage(shadow, question);
    const typingId = addTypingIndicator(shadow);

    isAskingQuestion = true;
    disableInput(shadow, true);

    try {
      const response = await fetch(`${API_BASE}/api/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_id: currentVideoId,
          question: question,
        }),
      });

      removeTypingIndicator(shadow, typingId);

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "Failed to get answer");
      }

      const data = await response.json();
      addBotMessage(shadow, data.answer);
    } catch (err) {
      removeTypingIndicator(shadow, typingId);
      addBotMessage(shadow, `❌ Error: ${err.message}`);
      console.error("YT Chat: ask error", err);
    } finally {
      isAskingQuestion = false;
      disableInput(shadow, false);
    }
  }

  // ── Message rendering ─────────────────────────────────────────────────────

  function getMessagesEl(shadow) {
    return shadow.getElementById("yt-chat-messages");
  }

  function clearMessages(shadow) {
    const el = getMessagesEl(shadow);
    // Keep the welcome message
    el.innerHTML = `
      <div class="welcome-message">
        <div class="welcome-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
            <path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2ZM20 16H5.17L4 17.17V4H20V16Z" fill="url(#grad2)" opacity="0.8"/>
            <path d="M12 14C12.55 14 13 13.55 13 13V10C13 9.45 12.55 9 12 9C11.45 9 11 9.45 11 10V13C11 13.55 11.45 14 12 14Z" fill="url(#grad2)"/>
            <circle cx="8" cy="11" r="1" fill="url(#grad2)"/>
            <circle cx="16" cy="11" r="1" fill="url(#grad2)"/>
            <defs>
              <linearGradient id="grad2" x1="0" y1="0" x2="24" y2="24">
                <stop offset="0%" stop-color="#FF4444"/>
                <stop offset="100%" stop-color="#7C3AED"/>
              </linearGradient>
            </defs>
          </svg>
        </div>
        <h3>Ask anything about this video</h3>
        <p>I'll analyze the transcript and answer your questions using AI.</p>
      </div>
    `;
  }

  function addUserMessage(shadow, text) {
    const el = getMessagesEl(shadow);
    // Remove welcome message if present
    const welcome = el.querySelector(".welcome-message");
    if (welcome) welcome.remove();

    const msgEl = document.createElement("div");
    msgEl.className = "chat-msg user-msg";
    msgEl.innerHTML = `
      <div class="msg-bubble user-bubble">
        <p>${escapeHtml(text)}</p>
      </div>
      <div class="msg-avatar user-avatar">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
        </svg>
      </div>
    `;
    el.appendChild(msgEl);
    scrollToBottom(el);
    chatHistory.push({ role: "user", text });
  }

  function addBotMessage(shadow, text) {
    const el = getMessagesEl(shadow);
    const msgEl = document.createElement("div");
    msgEl.className = "chat-msg bot-msg";
    msgEl.innerHTML = `
      <div class="msg-avatar bot-avatar">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M9.5 8.5L15.5 12L9.5 15.5V8.5Z"/>
        </svg>
      </div>
      <div class="msg-bubble bot-bubble">
        <p>${formatAnswer(text)}</p>
      </div>
    `;
    el.appendChild(msgEl);
    scrollToBottom(el);
    chatHistory.push({ role: "bot", text });
  }

  function addSystemMessage(shadow, text) {
    const el = getMessagesEl(shadow);
    // Remove welcome message
    const welcome = el.querySelector(".welcome-message");
    if (welcome) welcome.remove();

    const msgEl = document.createElement("div");
    msgEl.className = "chat-msg system-msg";
    msgEl.innerHTML = `<div class="system-bubble"><p>${text}</p></div>`;
    el.appendChild(msgEl);
    scrollToBottom(el);
  }

  function addTypingIndicator(shadow) {
    const el = getMessagesEl(shadow);
    const id = "typing-" + Date.now();
    const msgEl = document.createElement("div");
    msgEl.className = "chat-msg bot-msg";
    msgEl.id = id;
    msgEl.innerHTML = `
      <div class="msg-avatar bot-avatar">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M9.5 8.5L15.5 12L9.5 15.5V8.5Z"/>
        </svg>
      </div>
      <div class="msg-bubble bot-bubble typing-bubble">
        <div class="typing-dots">
          <span></span><span></span><span></span>
        </div>
      </div>
    `;
    el.appendChild(msgEl);
    scrollToBottom(el);
    return id;
  }

  function removeTypingIndicator(shadow, id) {
    const el = shadow.getElementById(id);
    if (el) el.remove();
  }

  // ── UI helpers ────────────────────────────────────────────────────────────

  function showStatus(shadow, text, showSpinner) {
    const statusEl = shadow.getElementById("yt-chat-status");
    statusEl.classList.add("visible");
    statusEl.innerHTML = `
      <div class="status-content">
        ${showSpinner ? '<div class="status-spinner"></div>' : ""}
        <span class="status-text">${text}</span>
      </div>
    `;
  }

  function hideStatus(shadow) {
    const statusEl = shadow.getElementById("yt-chat-status");
    statusEl.classList.remove("visible");
  }

  function disableInput(shadow, disabled) {
    const input = shadow.getElementById("yt-chat-input");
    const sendBtn = shadow.getElementById("yt-chat-send");
    input.disabled = disabled;
    sendBtn.disabled = disabled;
    if (!disabled) input.focus();
  }

  function scrollToBottom(el) {
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function formatAnswer(text) {
    // Basic markdown-ish formatting
    return escapeHtml(text)
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/`(.*?)`/g, "<code>$1</code>")
      .replace(/\n/g, "<br>");
  }

  // ── YouTube SPA navigation listener ───────────────────────────────────────

  // YouTube is an SPA — page navigations don't reload the page
  document.addEventListener("yt-navigate-finish", () => {
    if (panelOpen) {
      const shadow = panelEl?.shadowRoot;
      if (shadow) onPanelOpen(shadow);
    }
  });

  // Also watch for popstate (back/forward)
  window.addEventListener("popstate", () => {
    if (panelOpen) {
      setTimeout(() => {
        const shadow = panelEl?.shadowRoot;
        if (shadow) onPanelOpen(shadow);
      }, 500);
    }
  });

  // ── Message listener (from background.js) ─────────────────────────────────

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "toggle_panel") {
      togglePanel();
      sendResponse({ status: "ok" });
    }
    return true;
  });
})();
