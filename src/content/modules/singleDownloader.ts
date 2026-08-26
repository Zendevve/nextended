import { StorageManager } from '../../common/storage';
import { Logger } from '../../common/logger';
import { DownloadResolutionResult } from '../../common/types';
import { ENDPOINTS } from '../../common/endpoints';

export class SingleDownloader {
  static bypassNexusAdsCookie() {
    const now = Math.round(Date.now() / 1000);
    const expirySeconds = 5 * 60; // 5 minutes
    const expiryDate = new Date(Date.now() + expirySeconds * 1000).toUTCString();
    document.cookie = `ab=0|${now + expirySeconds};expires=${expiryDate};domain=nexusmods.com;path=/`;
  }

  static isCloudflareChallenge(text: string, status = 200, headers = ''): boolean {
    if (!text) return false;
    if (/cf-turnstile|challenges\.cloudflare\.com|Just a moment|Attention Required!|cf-error-details|id="challenge-form"|cf-browser-verification/i.test(text)) {
      return true;
    }
    return (status === 403 || status === 503) && /cf-ray|server:\s*cloudflare/i.test(headers) && text.trim().startsWith('<');
  }

  static parseDownloadURLFromResponse(text: string): string | null {
    if (!text) return null;
    try {
      const j = JSON.parse(text);
      const url = j?.url || j?.URI || j?.src || j?.download_url;
      if (url) return url.replace(/&amp;/g, '&');
    } catch {}
    const m = text.match(/id=["']dl_link["'][^>]*value=["']([^"']+)["']/i);
    return m ? m[1].replace(/&amp;/g, '&') : null;
  }

  static parseDownloadLink(text: string): string | null {
    if (!text) return null;
    const m = text
      .replace(/&amp;/g, '&')
      .replace(/\\\//g, '/')
      .match(/nxm:\/\/[^\s"'<>]+/i);
    if (!m || !m[0].includes('?')) return null;
    const p = new URLSearchParams(m[0].slice(m[0].indexOf('?') + 1));
    return p.has('key') && p.has('expires') && p.has('user_id') ? m[0] : null;
  }

  static async resolveDownloadUrl(opts: {
    fileId?: string | null;
    gameId?: string | null;
    isNMM?: boolean;
    href?: string;
  }): Promise<DownloadResolutionResult> {
    const { fileId, gameId, isNMM, href } = opts;
    this.bypassNexusAdsCookie();

    if (href?.startsWith('nxm://')) return { url: href };

    // Direct GenerateDownloadUrl API call
    if (fileId) {
      try {
        const body = `fid=${encodeURIComponent(fileId)}&game_id=${encodeURIComponent(gameId || '')}${isNMM ? '&nmm=1' : ''}`;
        const res = await fetch(ENDPOINTS.GENERATE_DOWNLOAD_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
            Referer: href || `https://www.nexusmods.com${location.pathname}?tab=files&file_id=${fileId}`
          },
          body,
          credentials: 'include'
        });

        const text = await res.text();
        if (this.isCloudflareChallenge(text, res.status)) {
          return { url: null, error: 'cloudflare-challenge', blockedUrl: href, rawText: text };
        }

        const url = this.parseDownloadURLFromResponse(text);
        if (url) return { url, rawText: text };
      } catch (err) {
        Logger.error('GenerateDownloadUrl fetch error:', err);
      }
    }

    // Fallback: HTML page scraping
    if (href && !href.startsWith('nxm://')) {
      try {
        const targetUrl = isNMM && !href.includes('nmm=1') ? `${href}${href.includes('?') ? '&' : '?'}nmm=1` : href;
        const res = await fetch(targetUrl, { credentials: 'include' });
        const text = await res.text();

        if (this.isCloudflareChallenge(text, res.status)) {
          return { url: null, error: 'cloudflare-challenge', blockedUrl: targetUrl, rawText: text };
        }

        // Regex scan
        const patterns = [
          /const downloadUrl = '([^']+)'/,
          /id="slowDownloadButton".*?data-download-url="([^"]+)"/,
          /data-download-url="([^"]+)"/,
          /"url"\s*:\s*"([^"]+)"/
        ];
        for (const pattern of patterns) {
          const match = text.match(pattern);
          if (match) {
            return { url: match[1].replace(/&amp;/g, '&'), rawText: text };
          }
        }

        const parsedLink = this.parseDownloadLink(text);
        if (parsedLink) return { url: parsedLink, rawText: text };
      } catch (err) {
        Logger.error('HTML scrape fallback error:', err);
      }
    }

    return { url: null, error: 'Could not resolve download link', blockedUrl: href };
  }

  static setButtonState(btn: HTMLElement | null, state: 'waiting' | 'downloading' | 'error', msg?: string) {
    if (!btn) return;
    const txtEl = (btn.querySelector('span.flex-label, span') || btn) as HTMLElement;
    const sc = {
      waiting: { text: 'Please Wait...', color: 'orange' },
      downloading: { text: 'Downloading!', color: 'green' },
      error: { text: msg || 'Error', color: 'red' }
    };
    if (txtEl && btn.dataset?.origText === undefined) {
      btn.dataset.origText = txtEl.innerText;
      btn.dataset.origColor = btn.style.color || '';
    }
    if (txtEl) txtEl.innerText = sc[state].text;
    btn.style.color = sc[state].color;
  }

  static restoreButtonState(btn: HTMLElement | null, delay = 3000) {
    if (!btn?.dataset?.origText) return;
    setTimeout(() => {
      const txtEl = (btn.querySelector('span.flex-label, span') || btn) as HTMLElement;
      if (txtEl) txtEl.innerText = btn.dataset.origText || '';
      btn.style.color = btn.dataset.origColor || '';
    }, delay);
  }

  static async startDownloadFlow(opts: {
    btn?: HTMLElement | null;
    fileId?: string | null;
    gameId?: string | null;
    isNMM?: boolean;
    href?: string;
    isAutoStart?: boolean;
  }) {
    const { btn, fileId, gameId, isNMM, href, isAutoStart } = opts;
    const config = await StorageManager.getConfig();

    if (btn) this.setButtonState(btn, 'waiting');
    Logger.debug(isAutoStart ? 'Auto-start download flow' : 'Download flow started', { fileId, isNMM, href });

    const result = await this.resolveDownloadUrl({ fileId, gameId, isNMM, href });

    if (result.error || !result.url) {
      if (config.vpnMode) {
        const fallbackUrl = result.blockedUrl || href || `https://www.nexusmods.com${location.pathname}?tab=files&file_id=${fileId}${isNMM ? '&nmm=1' : ''}`;
        Logger.info('VPN mode redirect fallback:', fallbackUrl);
        if (btn) this.setButtonState(btn, 'downloading');
        location.assign(fallbackUrl);
        if (btn) this.restoreButtonState(btn);
        return;
      }

      const errMsg = result.error === 'cloudflare-challenge'
        ? 'Nexus is displaying a Cloudflare security challenge. Please resolve it in your browser.'
        : result.error || 'Failed to get download URL';

      if (btn) this.setButtonState(btn, 'error', errMsg);
      if (config.showAlertsOnError) alert(`[nextended] Download Error: ${errMsg}`);
      if (btn) this.restoreButtonState(btn, 4000);
      return;
    }

    if (btn) this.setButtonState(btn, 'downloading');

    if (isNMM || result.url.startsWith('nxm://')) {
      location.href = result.url;
    } else {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ type: 'TRIGGER_DOWNLOAD', url: result.url });
      } else {
        const a = document.createElement('a');
        a.href = result.url;
        a.click();
      }
    }

    if (btn) this.restoreButtonState(btn);

    if (isAutoStart && config.autoCloseTab) {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ type: 'AUTO_CLOSE_TAB', delayMs: config.closeTabDelayMs });
      } else {
        setTimeout(() => window.close(), config.closeTabDelayMs);
      }
    }
  }
}
