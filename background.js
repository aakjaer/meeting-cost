// Meeting Cost Tracker - Service Worker

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'openSettings') {
    chrome.runtime.openOptionsPage();
  }
});
