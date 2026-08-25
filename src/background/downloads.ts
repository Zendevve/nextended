// src/background/downloads.ts — chrome.downloads wrapper for browser mode.
// Vortex mode (the default) doesn't need this: the content script calls
// location.assign(nxm://) directly per PRD §3.3 / FR9.

export interface BrowserDownloadResult {
  ok: boolean;
  downloadId?: number;
  error?: string;
}

export async function startBrowserDownload(
  url: string,
  filename?: string,
): Promise<BrowserDownloadResult> {
  try {
    const init: chrome.downloads.DownloadOptions = { url };
    if (filename) init.filename = filename;
    const downloadId = await chrome.downloads.download(init);
    return { ok: true, downloadId };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: message };
  }
}
