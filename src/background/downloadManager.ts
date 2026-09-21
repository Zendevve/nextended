import { StorageManager } from '../common/storage';
import { Logger } from '../common/logger';
import { ExternalDownloaderMode } from '../common/types';

export interface ExternalDownloadResult {
  success: boolean;
  mode?: ExternalDownloaderMode;
  gid?: string;
  error?: string;
}

export class DownloadManager {
  private static readonly ARIA2_RPC_ID = 'nextended';

  /** Mod ids awaiting their download's filename determination, keyed by download URL. */
  private static readonly pendingModIds = new Map<string, string | number>();

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
      const modId = this.pendingModIds.get(item.url);
      if (modId !== undefined) this.pendingModIds.delete(item.url);

      const config = await StorageManager.getConfig();
      if (!config.overrideFileNames || !item.url.includes('nexus-cdn.com')) {
        suggest();
        return;
      }

      // Check if file is already tagged or sanitize
      const originalFilename = item.filename || 'nexus_download';
      const filename = modId !== undefined ? this.buildOverrideFilename(originalFilename, modId) : originalFilename;
      suggest({ filename, conflictAction: 'uniquify' });
    } catch (err) {
      Logger.error('Error during filename suggestion:', err);
      suggest();
    }
  }

  /**
   * Builds the override filename `name-<modId>.ext`: appends the mod id before the
   * extension, preserving it. The name is left untouched when the id already appears
   * as a bounded token (delimited by non-alphanumerics or the base name's edges).
   */
  static buildOverrideFilename(filename: string, modId: string | number): string {
    const id = String(modId).trim();
    if (!id) return filename;

    const dot = filename.lastIndexOf('.');
    const base = dot > 0 ? filename.slice(0, dot) : filename;
    const extension = dot > 0 ? filename.slice(dot) : '';

    const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const boundedToken = new RegExp(`(?:^|[^A-Za-z0-9])${escapedId}(?![A-Za-z0-9])`);
    if (boundedToken.test(base)) return filename;

    return `${base}-${id}${extension}`;
  }

  static triggerDownload(url: string, filename?: string, modId?: string | number): Promise<number | null> {
    const normalizedId = modId !== undefined && modId !== null ? String(modId).trim() : '';
    if (normalizedId) this.pendingModIds.set(url, normalizedId);
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
              this.pendingModIds.delete(url); // failed download never reaches filename determination
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

  /** Pure payload builder for aria2 JSON-RPC `aria2.addUri` (token auth is aria2's documented secret mechanism). */
  static buildAria2Request(
    rpcUrl: string,
    secret: string,
    url: string,
    filename?: string
  ): { url: string; body: string } {
    const params: unknown[] = [];
    if (secret) params.push(`token:${secret}`);
    params.push([url]);
    params.push(filename ? { out: filename } : {});
    return {
      url: rpcUrl,
      body: JSON.stringify({ jsonrpc: '2.0', id: this.ARIA2_RPC_ID, method: 'aria2.addUri', params })
    };
  }

  static async sendToAria2(url: string, filename?: string): Promise<ExternalDownloadResult> {
    const { externalDownloader: ext } = await StorageManager.getConfig();
    const request = this.buildAria2Request(ext.rpcUrl, ext.secret, url, filename);
    try {
      const res = await fetch(request.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: request.body
      });
      const data = (await res.json()) as { result?: string; error?: { message?: string } };
      if (data.error) {
        Logger.error('aria2 RPC error:', data.error.message);
        return { success: false, mode: ExternalDownloaderMode.ARIA2, error: data.error.message || 'aria2 RPC error' };
      }
      Logger.info('Sent to aria2:', filename || url, 'gid:', data.result);
      return { success: true, mode: ExternalDownloaderMode.ARIA2, gid: data.result };
    } catch (err) {
      Logger.error('aria2 RPC request failed (is aria2 running with --enable-rpc?):', err);
      return { success: false, mode: ExternalDownloaderMode.ARIA2, error: 'aria2 unreachable' };
    }
  }

  static async sendToClipboard(url: string, filename?: string): Promise<ExternalDownloadResult> {
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
        return { success: false, mode: ExternalDownloaderMode.CLIPBOARD, error: 'clipboard unavailable' };
      }
      await navigator.clipboard.writeText(url);
      Logger.info('Copied download URL to clipboard:', filename || url);
      return { success: true, mode: ExternalDownloaderMode.CLIPBOARD };
    } catch (err) {
      Logger.error('Clipboard write failed:', err);
      return { success: false, mode: ExternalDownloaderMode.CLIPBOARD, error: 'clipboard write failed' };
    }
  }

  static async dispatchExternalDownload(url: string, filename?: string): Promise<ExternalDownloadResult> {
    const { externalDownloader: ext } = await StorageManager.getConfig();
    if (!ext.enabled) {
      return { success: false, error: 'external downloader disabled' };
    }
    return ext.mode === ExternalDownloaderMode.ARIA2
      ? this.sendToAria2(url, filename)
      : this.sendToClipboard(url, filename);
  }
}
