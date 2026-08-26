import { StorageManager } from '../common/storage';
import { Logger } from '../common/logger';

export class DownloadManager {
  static init() {
    if (typeof chrome !== 'undefined' && chrome.downloads && chrome.downloads.onDeterminingFilename) {
      chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
        this.handleFilenameDetermination(item, suggest);
        return true; // async suggestion
      });
    }
  }

  static async handleFilenameDetermination(
    item: chrome.downloads.DownloadItem,
    suggest: (suggestion?: chrome.downloads.DownloadFilenameSuggestion) => void
  ) {
    try {
      const config = await StorageManager.getConfig();
      if (!config.overrideFileNames || !item.url.includes('nexus-cdn.com')) {
        suggest();
        return;
      }

      // Check if file is already tagged or sanitize
      const originalFilename = item.filename || 'nexus_download';
      suggest({ filename: originalFilename, conflictAction: 'uniquify' });
    } catch (err) {
      Logger.error('Error during filename suggestion:', err);
      suggest();
    }
  }

  static triggerDownload(url: string, filename?: string): Promise<number | null> {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.downloads) {
        chrome.downloads.download(
          {
            url,
            filename,
            saveAs: false
          },
          (downloadId) => {
            if (chrome.runtime.lastError) {
              Logger.error('chrome.downloads.download error:', chrome.runtime.lastError.message);
              resolve(null);
            } else {
              resolve(downloadId || null);
            }
          }
        );
      } else {
        const a = document.createElement('a');
        a.href = url;
        if (filename) a.download = filename;
        a.click();
        resolve(1);
      }
    });
  }
}
