import { StorageManager } from '../../common/storage';
import { Logger } from '../../common/logger';
import { DownloadResolutionResult } from '../../common/types';
import { ENDPOINTS } from '../../common/endpoints';
import { GraphQLClient } from './graphQLClient';

export class SingleDownloader {
  static bypassNexusAdsCookie() {
    const now = Math.round(Date.now() / 1000);
    const expirySeconds = 5 * 60; // 5 minutes
    const expiryDate = new Date(Date.now() + expirySeconds * 1000).toUTCString();
    if (typeof document !== 'undefined') {
      document.cookie = `ab=0|${now + expirySeconds};expires=${expiryDate};domain=nexusmods.com;path=/`;
    }
  }

  static isCloudflareChallenge(text: string, status = 200, headers = ''): boolean {
    if (!text) return false;
    if (
      /cf-turnstile|challenges\.cloudflare\.com|Just a moment|Attention Required!|cf-error-details|id="challenge-form"|cf-browser-verification/i.test(
        text
      )
    ) {
      return true;
    }
    return (status === 403 || status === 503) && /cf-ray|server:\s*cloudflare/i.test(headers) && text.trim().startsWith('<');
  }

  static isDirectDownloadUrl(url: string): boolean {
    if (!url) return false;
    if (url.startsWith('nxm://')) return true;
    if (/\bnexus-cdn\.com\//i.test(url) && /[?&](key|expires)=/i.test(url)) return true;
    if (/^https?:\/\/[^/]+\.(?:nexus-cdn|nexusmods)\.com\/.+\.(?:zip|7z|rar|pdf|exe|dmg|pak|bsa|ba2|esp|esl|esm)/i.test(url)) return true;
    return false;
  }

  static extractDirectDownloadFromText(text: string): string | null {
    if (!text) return null;

    const dataAttr = text.match(/data-download-url=["']([^"']+)["']/i);
    if (dataAttr && dataAttr[1]) return dataAttr[1].replace(/&amp;/g, '&').replace(/\\\//g, '/');

    const dlInput1 = text.match(/<input[^>]+id=["']dl_link["'][^>]*value=["']([^"']+)["']/i);
    if (dlInput1 && dlInput1[1]) return dlInput1[1].replace(/&amp;/g, '&').replace(/\\\//g, '/');

    const dlInput2 = text.match(/<input[^>]+value=["']([^"']+)["'][^>]*id=["']dl_link["']/i);
    if (dlInput2 && dlInput2[1]) return dlInput2[1].replace(/&amp;/g, '&').replace(/\\\//g, '/');

    const constDecl = text.match(/(?:const|let|var)\s+downloadUrl\s*=\s*['"]([^'"]+)['"]/i);
    if (constDecl && constDecl[1]) return constDecl[1].replace(/&amp;/g, '&').replace(/\\\//g, '/');

    const jsonUrl = text.match(/"(?:url|downloadUrl|DirectDownloadLink|DirectDownloadUrl|URI)"\s*:\s*"(https?:\/\/[^"\\]*(?:\\.[^"\\]*)*)"/i);
    if (jsonUrl && jsonUrl[1]) return jsonUrl[1].replace(/&amp;/g, '&').replace(/\\\//g, '/');

    const nxmMatch = text.replace(/&amp;/g, '&').replace(/\\\//g, '/').match(/nxm:\/\/[^\s"'<>]+/i);
    if (nxmMatch && nxmMatch[0].includes('?')) {
      const params = new URLSearchParams(nxmMatch[0].slice(nxmMatch[0].indexOf('?') + 1));
      if (params.has('key') && params.has('expires')) {
        return nxmMatch[0];
      }
    }

    const cdnMatch = text.match(/https?:\/\/[^"'\s<>]+\.(?:nexus-cdn|nexusmods)\.com\/[^"'\s<>]+\.(?:zip|7z|rar|pdf|exe|dmg|pak|bsa|ba2|esp|esl|esm)[^"'\s<>]*/i);
    if (cdnMatch && cdnMatch[0]) return cdnMatch[0].replace(/&amp;/g, '&').replace(/\\\//g, '/');

    return null;
  }

  static parseDownloadUrlFromResponse(text: string): string | null {
    if (!text) return null;
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed) && parsed.length > 0) {
        for (const item of parsed) {
          const url =
            item?.url ||
            item?.URI ||
            item?.src ||
            item?.download_url ||
            item?.downloadUrl ||
            item?.DirectDownloadLink ||
            item?.DirectDownloadUrl ||
            item?.data?.url ||
            item?.data?.downloadUrl;
          if (url && typeof url === 'string') return url.replace(/&amp;/g, '&').replace(/\\\//g, '/');
        }
      }
      const direct =
        parsed?.url ||
        parsed?.URI ||
        parsed?.src ||
        parsed?.download_url ||
        parsed?.downloadUrl ||
        parsed?.DirectDownloadLink ||
        parsed?.DirectDownloadUrl ||
        parsed?.data?.url ||
        parsed?.data?.downloadUrl ||
        parsed?.data?.URI;
      if (direct && typeof direct === 'string') return direct.replace(/&amp;/g, '&').replace(/\\\//g, '/');
    } catch {}

    const dlInput =
      text.match(/id=["']dl_link["'][^>]*value=["']([^"']+)["']/i) ||
      text.match(/value=["']([^"']+)["'][^>]*id=["']dl_link["']/i);
    if (dlInput && dlInput[1]) return dlInput[1].replace(/&amp;/g, '&').replace(/\\\//g, '/');

    const dataAttr = text.match(/data-download-url=["']([^"']+)["']/i);
    if (dataAttr && dataAttr[1]) return dataAttr[1].replace(/&amp;/g, '&').replace(/\\\//g, '/');

    return null;
  }

  // Alias for compatibility
  static parseDownloadURLFromResponse(text: string): string | null {
    return this.parseDownloadUrlFromResponse(text);
  }

  static parseDownloadLink(text: string): string | null {
    if (!text) return null;
    const m = text
      .replace(/&amp;/g, '&')
      .replace(/\\\//g, '/')
      .match(/nxm:\/\/[^\s"'<>]+/i);
    if (!m || !m[0].includes('?')) return null;
    const p = new URLSearchParams(m[0].slice(m[0].indexOf('?') + 1));
    return p.has('key') && p.has('expires') ? m[0] : null;
  }

  static async resolveDownloadUrl(opts: {
    fileId?: string | null;
    gameId?: string | null;
    gameName?: string | null;
    isNMM?: boolean;
    href?: string;
  }): Promise<DownloadResolutionResult> {
    const { fileId: rawFileId, gameId: rawGameId, gameName: rawGameName, isNMM, href } = opts;
    let fileId = rawFileId || null;
    let gameId = rawGameId || null;
    let gameName = rawGameName || null;

    this.bypassNexusAdsCookie();

    // 1. Resolve domain slug and numeric game ID
    let domainSlug = gameName || '';
    if (!domainSlug && gameId && !/^\d+$/.test(gameId)) {
      domainSlug = gameId;
    }
    if (!domainSlug && typeof location !== 'undefined') {
      const segs = location.pathname.split('/').filter(Boolean);
      if (segs[0] === 'games' && segs[1]) domainSlug = segs[1];
      else if (segs[0] && segs[0] !== 'mods') domainSlug = segs[0];
    }

    let numericGameId = gameId && /^\d+$/.test(gameId) ? gameId : '';
    if (!numericGameId && domainSlug) {
      try {
        const fetched = await GraphQLClient.fetchGameId(domainSlug);
        if (fetched && /^\d+$/.test(fetched)) {
          numericGameId = fetched;
        }
      } catch (err) {
        Logger.error('SingleDownloader GraphQL fetchGameId error:', err);
      }
    }
    if (!fileId && typeof location !== 'undefined') {
      const match = location.pathname.match(/\/mods\/(\d+)/);
      if (match && match[1] && domainSlug) {
        try {
          const fetchedFid = await GraphQLClient.fetchPrimaryModFileId(domainSlug, parseInt(match[1], 10));
          if (fetchedFid) fileId = fetchedFid;
        } catch (err) {
          Logger.error('SingleDownloader GraphQL fetchPrimaryModFileId error:', err);
        }
      }
    }

    // 2. Check if href is already a direct download or NXM link
    if (href?.startsWith('nxm://')) return { url: href };
    if (href && this.isDirectDownloadUrl(href)) return { url: href };

    // 3. Inspect active live DOM directly
    if (typeof document !== 'undefined') {
      const liveSlowBtn = document.getElementById('slowDownloadButton') as HTMLElement | null;
      const liveDataEl = document.querySelector('[data-download-url]') as HTMLElement | null;
      const liveUrl = liveSlowBtn?.getAttribute('data-download-url') || liveDataEl?.getAttribute('data-download-url');
      if (liveUrl) {
        return {
          url: liveUrl.replace(/&amp;/g, '&').replace(/\\\//g, '/'),
          rawText: document.documentElement?.outerHTML
        };
      }

      const liveDlInput = document.querySelector('input#dl_link') as HTMLInputElement | null;
      if (liveDlInput?.value) {
        return {
          url: liveDlInput.value.replace(/&amp;/g, '&').replace(/\\\//g, '/'),
          rawText: document.documentElement?.outerHTML
        };
      }
    }

    // 4. If href is a relative or absolute ModRequirementsPopUp URL, fetch and extract
    if (href && /ModRequirementsPopUp/i.test(href)) {
      try {
        const fullPopUpUrl = new URL(href, 'https://www.nexusmods.com').href;
        const targetUrl = isNMM && !fullPopUpUrl.includes('nmm=1') ? `${fullPopUpUrl}${fullPopUpUrl.includes('?') ? '&' : '?'}nmm=1` : fullPopUpUrl;
        const res = await fetch(targetUrl, { credentials: 'include' });
        const text = await res.text();

        if (this.isCloudflareChallenge(text, res.status)) {
          return { url: null, error: 'cloudflare-challenge', blockedUrl: targetUrl, rawText: text };
        }

        const direct = this.extractDirectDownloadFromText(text) || this.parseDownloadUrlFromResponse(text) || this.parseDownloadLink(text);
        if (direct) return { url: direct, rawText: text };
      } catch (err) {
        Logger.error('ModRequirementsPopUp direct href fetch error:', err);
      }
    }

    // 5. Primary API: GenerateDownloadUrl POST endpoint
    if (fileId) {
      try {
        const params = new URLSearchParams();
        params.set('fid', fileId);
        if (numericGameId) {
          params.set('game_id', numericGameId);
        } else if (gameId && /^\d+$/.test(gameId)) {
          params.set('game_id', gameId);
        }
        if (domainSlug) {
          params.set('game_name', domainSlug);
        } else if (gameName) {
          params.set('game_name', gameName);
        } else if (gameId && !/^\d+$/.test(gameId)) {
          params.set('game_name', gameId);
        }
        if (isNMM) {
          params.set('nmm', '1');
        }

        const refererUrl =
          href && href.startsWith('http')
            ? href
            : typeof location !== 'undefined'
            ? `https://www.nexusmods.com${location.pathname}?tab=files&file_id=${fileId}`
            : `https://www.nexusmods.com/${domainSlug || 'stardewvalley'}/mods/51105?tab=files&file_id=${fileId}`;

        const res = await fetch(ENDPOINTS.GENERATE_DOWNLOAD_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
            Referer: refererUrl
          },
          body: params.toString(),
          credentials: 'include'
        });

        const text = await res.text();
        if (this.isCloudflareChallenge(text, res.status)) {
          return { url: null, error: 'cloudflare-challenge', blockedUrl: href || refererUrl, rawText: text };
        }

        const url = this.parseDownloadUrlFromResponse(text);
        if (url) return { url, rawText: text };

        const directFromApi = this.extractDirectDownloadFromText(text) || this.parseDownloadLink(text);
        if (directFromApi) return { url: directFromApi, rawText: text };
      } catch (err) {
        Logger.error('GenerateDownloadUrl fetch error:', err);
      }

      // 6. Fallback: Query all Nexus popup widget endpoints
      const widgets = ['DownloadPopUp', 'ModRequirementsPopUp', 'ModDownloadPopUp', 'RequirementsPopUp'];
      for (const widget of widgets) {
        try {
          const effectiveGid = numericGameId || gameId || '';
          const popUpUrl = `https://www.nexusmods.com/Core/Libs/Common/Widgets/${widget}?id=${encodeURIComponent(
            fileId
          )}&game_id=${encodeURIComponent(effectiveGid)}${isNMM ? '&nmm=1' : ''}`;

          const popUpRes = await fetch(popUpUrl, { credentials: 'include' });
          const popUpText = await popUpRes.text();

          if (this.isCloudflareChallenge(popUpText, popUpRes.status)) {
            return { url: null, error: 'cloudflare-challenge', blockedUrl: popUpUrl, rawText: popUpText };
          }

          const directFromPopup =
            this.extractDirectDownloadFromText(popUpText) ||
            this.parseDownloadLink(popUpText) ||
            this.parseDownloadUrlFromResponse(popUpText);
          if (directFromPopup) return { url: directFromPopup, rawText: popUpText };
        } catch (err) {
          Logger.error(`${widget} fallback fetch error:`, err);
        }
      }
    }
    // 7. Fallback: Fetch & scrape href HTML page
    if (href && !href.startsWith('nxm://')) {
      try {
        const fullHref = new URL(href, 'https://www.nexusmods.com').href;
        const targetUrl = isNMM && !fullHref.includes('nmm=1') ? `${fullHref}${fullHref.includes('?') ? '&' : '?'}nmm=1` : fullHref;
        const res = await fetch(targetUrl, { credentials: 'include' });
        const text = await res.text();

        if (this.isCloudflareChallenge(text, res.status)) {
          return { url: null, error: 'cloudflare-challenge', blockedUrl: targetUrl, rawText: text };
        }

        const directFromText = this.extractDirectDownloadFromText(text) || this.parseDownloadUrlFromResponse(text);
        if (directFromText) {
          return { url: directFromText, rawText: text };
        }

        const patterns = [
          /const downloadUrl = '([^']+)'/,
          /id="slowDownloadButton"[^>]*data-download-url="([^"]+)"/,
          /data-download-url="([^"]+)"/,
          /"(?:url|downloadUrl|DirectDownloadLink|DirectDownloadUrl|URI)"\s*:\s*"([^"]+)"/
        ];
        for (const pattern of patterns) {
          const match = text.match(pattern);
          if (match && match[1]) {
            return { url: match[1].replace(/&amp;/g, '&').replace(/\\\//g, '/'), rawText: text };
          }
        }

        const parsedLink = this.parseDownloadLink(text);
        if (parsedLink) return { url: parsedLink, rawText: text };
      } catch (err) {
        Logger.error('HTML scrape fallback error:', err);
      }
    }

    // 8. Fallback: Live DOM scraping and location.href
    if (typeof document !== 'undefined') {
      const liveText = document.documentElement?.outerHTML || '';
      const liveDirect =
        this.extractDirectDownloadFromText(liveText) ||
        this.parseDownloadUrlFromResponse(liveText) ||
        this.parseDownloadLink(liveText);
      if (liveDirect) {
        return { url: liveDirect, rawText: liveText };
      }
    }

    if (typeof location !== 'undefined' && this.isDirectDownloadUrl(location.href)) {
      return { url: location.href };
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
    gameName?: string | null;
    isNMM?: boolean;
    href?: string;
    isAutoStart?: boolean;
  }) {
    const { btn, fileId, gameId, gameName, isNMM, href, isAutoStart } = opts;
    const config = await StorageManager.getConfig();

    if (btn) this.setButtonState(btn, 'waiting');
    Logger.debug(isAutoStart ? 'Auto-start download flow' : 'Download flow started', { fileId, isNMM, href });

    const result = await this.resolveDownloadUrl({ fileId, gameId, gameName, isNMM, href });

    if (result.error || !result.url) {
      if (result.error === 'cloudflare-challenge') {
        const challengeMsg = 'Nexus is displaying a Cloudflare security challenge. Please resolve it in your browser.';
        if (btn) this.setButtonState(btn, 'error', challengeMsg);
        if (config.showAlertsOnError) alert(`[nextended] Download Error: ${challengeMsg}`);
        if (btn) this.restoreButtonState(btn, 4000);
        return;
      }

      // Graceful fallback redirect: navigate to the files tab or file download countdown page
      const domain =
        gameName ||
        (gameId && !/^\d+$/.test(gameId) ? gameId : '') ||
        (typeof location !== 'undefined' ? location.pathname.split('/').filter(Boolean)[0] : '');
      const modMatch = typeof location !== 'undefined' ? location.pathname.match(/\/mods\/(\d+)/) : null;
      const modId = modMatch ? modMatch[1] : '';
      const fallbackUrl =
        result.blockedUrl ||
        (fileId && modId && domain
          ? `https://www.nexusmods.com/${domain}/mods/${modId}?tab=files&file_id=${fileId}${isNMM ? '&nmm=1' : ''}`
          : href || (modId && domain ? `https://www.nexusmods.com/${domain}/mods/${modId}?tab=files` : null));
      if (fallbackUrl && typeof location !== 'undefined') {
        Logger.info('Redirecting to manual download page fallback:', fallbackUrl);
        if (btn) this.setButtonState(btn, 'downloading');
        location.assign(fallbackUrl);
        if (btn) this.restoreButtonState(btn);
        return;
      }

      const errMsg = result.error || 'Failed to get download URL';
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
