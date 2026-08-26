import { DownloadManager } from './downloadManager';
import { TabManager } from './tabManager';
import { StorageManager } from '../common/storage';
import { Logger } from '../common/logger';

// Initialize background handlers
DownloadManager.init();

if (typeof chrome !== 'undefined' && chrome.runtime) {
  chrome.runtime.onInstalled.addListener(async () => {
    Logger.info('nextended extension installed or updated.');
    await StorageManager.getConfig(); // ensure default config is written
  });

  // Message dispatcher from content scripts
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'AUTO_CLOSE_TAB') {
      const delay = message.delayMs || 2000;
      if (sender.tab?.id) {
        setTimeout(() => {
          if (sender.tab?.id) {
            chrome.tabs.remove(sender.tab.id, () => {
              if (chrome.runtime.lastError) {
                Logger.warn('Error removing tab:', chrome.runtime.lastError.message);
              }
            });
          }
        }, delay);
      } else {
        TabManager.closeCurrentTabAfterDelay(delay);
      }
      sendResponse({ success: true });
    } else if (message.type === 'TRIGGER_DOWNLOAD') {
      DownloadManager.triggerDownload(message.url, message.filename).then((id) => {
        sendResponse({ downloadId: id });
      });
      return true; // asynchronous
    }
  });
}
