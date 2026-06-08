/**
 * Background service worker for YT Chat extension.
 * Listens for extension icon clicks and forwards toggle messages to the content script.
 */

chrome.action.onClicked.addListener(async (tab) => {
  // Only work on YouTube pages
  if (!tab.url || !tab.url.includes("youtube.com")) {
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { action: "toggle_panel" });
  } catch (err) {
    // Content script may not be injected yet — inject it first
    console.warn("Content script not ready, attempting injection...", err);
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"],
      });
      // Retry sending the toggle message after injection
      setTimeout(async () => {
        await chrome.tabs.sendMessage(tab.id, { action: "toggle_panel" });
      }, 300);
    } catch (injectErr) {
      console.error("Failed to inject content script:", injectErr);
    }
  }
});
