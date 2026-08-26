import { Logger } from '../common/logger';

export class TabManager {
  static closeCurrentTabAfterDelay(delayMs: number) {
    setTimeout(() => {
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]?.id) {
            chrome.tabs.remove(tabs[0].id, () => {
              if (chrome.runtime.lastError) {
                Logger.warn('Could not auto-close tab:', chrome.runtime.lastError.message);
              }
            });
          }
        });
      } else {
        window.close();
      }
    }, delayMs);
  }
}
