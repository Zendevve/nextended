import { StorageManager } from '../../common/storage';
import { Logger } from '../../common/logger';
import { DownloadResolutionResult } from '../../common/types';
import { ENDPOINTS } from '../../common/endpoints';
import { RequestTimeout } from '../../common/requestTimeout';
import { GraphQLClient } from './graphQLClient';

export class SingleDownloader {
  private static readonly CF_MARKER_RE =
    /cf-turnstile|challenges\.cloudflare\.com|Just a moment|Attention Required!|cf-error-details|id="challenge-form"|cf-browser-verification/i;
  private static readonly CF_HEADER_RE = /cf-ray|server:\s*cloudflare/i;

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
    // Single precompiled case-insensitive scan: no per-call lowercase copy, and
    // the marker set matches the Nexus challenge markup exactly.
    if (SingleDownloader.CF_MARKER_RE.test(text)) return true;
    return (
      (status === 403 || status === 503) &&
      SingleDownloader.CF_HEADER_RE.test(headers) &&
      text.trim().startsWith('<')
    );
  }

  static isDirectDownloadUrl(url: string): boolean {
    if (!url) return false;
    if (url.startsWith('nxm://')) return true;
    const lower = url.toLowerCase();
    if (!lower.includes('nexus-cdn.com/') && !lower.includes('nexusmods.com/')) return false;
    if (lower.includes('nexus-cdn.com/') && (url.includes('key=') || url.includes('expires='))) {
      if (url.includes('?') || url.includes('&')) return true;
    }
    if (!lower.startsWith('http://') && !lower.startsWith('https://')) return false;
    const dot = lower.indexOf('.com/');
    if (dot === -1) return false;
    const extIndex = lower.lastIndexOf('.');
    if (extIndex < dot) return false;
    const ext = lower.slice(extIndex + 1).split(/[?#\s"'<>]/)[0];
    return ext === 'zip' || ext === '7z' || ext === 'rar' || ext === 'pdf' || ext === 'exe' || ext === 'dmg' || ext === 'pak' || ext === 'bsa' || ext === 'ba2' || ext === 'esp' || ext === 'esl' || ext === 'esm';
  }

  static extractDirectDownloadFromText(text: string): string | null {
    if (!text) return null;
    const hasAmpEntity = text.includes('&amp;');
    const hasEscSlash = text.includes('\\/');

    if (text.includes('data-download-url=')) {
      const dataAttr = text.match(/data-download-url=["']([^"']+)["']/i);
      if (dataAttr && dataAttr[1]) return SingleDownloader.unescapeUrl(dataAttr[1], hasAmpEntity, hasEscSlash);
    }

    if (text.includes('dl_link')) {
      const dlInput1 = text.match(/<input[^>]+id=["']dl_link["'][^>]*value=["']([^"']+)["']/i);
      if (dlInput1 && dlInput1[1]) return SingleDownloader.unescapeUrl(dlInput1[1], hasAmpEntity, hasEscSlash);

      const dlInput2 = text.match(/<input[^>]+value=["']([^"']+)["'][^>]*id=["']dl_link["']/i);
      if (dlInput2 && dlInput2[1]) return SingleDownloader.unescapeUrl(dlInput2[1], hasAmpEntity, hasEscSlash);
    }

    if (text.includes('downloadUrl')) {
      const constDecl = text.match(/(?:const|let|var)\s+downloadUrl\s*=\s*['"]([^'"]+)['"]/i);
      if (constDecl && constDecl[1]) return SingleDownloader.unescapeUrl(constDecl[1], hasAmpEntity, hasEscSlash);
    }

    if (text.includes('://') && (text.includes('downloadUrl') || text.includes('DirectDownload') || text.includes('URI') || text.includes('"url"'))) {
      const jsonUrl = text.match(/"(?:url|downloadUrl|DirectDownloadLink|DirectDownloadUrl|URI)"\s*:\s*"(https?:\/\/[^"\\]*(?:\\.[^"\\]*)*)"/i);
      if (jsonUrl && jsonUrl[1]) return SingleDownloader.unescapeUrl(jsonUrl[1], hasAmpEntity, hasEscSlash);
    }

    if (text.includes('nxm://')) {
      const nxmMatch = SingleDownloader.unescapeUrl(text, hasAmpEntity, hasEscSlash).match(/nxm:\/\/[^\s"'<>]+/i);
      if (nxmMatch && nxmMatch[0].includes('?')) {
        const qIndex = nxmMatch[0].indexOf('?');
        const params = new URLSearchParams(nxmMatch[0].slice(qIndex + 1));
        if (params.has('key') && params.has('expires')) {
          return nxmMatch[0];
        }
      }
    }

    if (text.includes('nexus-cdn.com/') || text.includes('nexusmods.com/')) {
      const cdnMatch = text.match(/https?:\/\/[^"'\s<>]+\.(?:nexus-cdn|nexusmods)\.com\/[^"'\s<>]+\.(?:zip|7z|rar|pdf|exe|dmg|pak|bsa|ba2|esp|esl|esm)[^"'\s<>]*/i);
      if (cdnMatch && cdnMatch[0]) return SingleDownloader.unescapeUrl(cdnMatch[0], hasAmpEntity, hasEscSlash);
    }

    return null;
  }

  private static unescapeUrl(url: string, hasAmpEntity: boolean, hasEscSlash: boolean): string {
    let out = url;
    if (hasAmpEntity && out.includes('&amp;')) out = out.replace(/&amp;/g, '&');
    if (hasEscSlash && out.includes('\\/')) out = out.replace(/\\\//g, '/');
    return out;
  }

  static parseDownloadUrlFromResponse(text: string): string | null {
    if (!text) return null;
    const first = text.charCodeAt(text.search(/\S/));
    if (first === 123 || first === 91) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed) && parsed.length > 0) {
          for (const item of parsed) {
            const itemUrl =
              item?.url ||
              item?.URI ||
              item?.src ||
              item?.download_url ||
              item?.downloadUrl ||
              item?.DirectDownloadLink ||
              item?.DirectDownloadUrl ||
              item?.data?.url ||
              item?.data?.downloadUrl;
            if (itemUrl && typeof itemUrl === 'string') {
              return itemUrl.includes('&amp;') || itemUrl.includes('\\/') ? itemUrl.replace(/&amp;/g, '&').replace(/\\\//g, '/') : itemUrl;
            }
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
        if (direct && typeof direct === 'string') {
          return direct.includes('&amp;') || direct.includes('\\/') ? direct.replace(/&amp;/g, '&').replace(/\\\//g, '/') : direct;
        }
      } catch {}
    }

    if (text.includes('dl_link')) {
      const dlInput =
        text.match(/id=["']dl_link["'][^>]*value=["']([^"']+)["']/i) ||
        text.match(/value=["']([^"']+)["'][^>]*id=["']dl_link["']/i);
      if (dlInput && dlInput[1]) {
        return dlInput[1].includes('&amp;') || dlInput[1].includes('\\/') ? dlInput[1].replace(/&amp;/g, '&').replace(/\\\//g, '/') : dlInput[1];
      }
    }

    if (text.includes('data-download-url=')) {
      const dataAttr = text.match(/data-download-url=["']([^"']+)["']/i);
      if (dataAttr && dataAttr[1]) {
        return dataAttr[1].includes('&amp;') || dataAttr[1].includes('\\/') ? dataAttr[1].replace(/&amp;/g, '&').replace(/\\\//g, '/') : dataAttr[1];
      }
    }

    return null;
  }

  // Alias for compatibility
  static parseDownloadURLFromResponse(text: string): string | null {
    return this.parseDownloadUrlFromResponse(text);
  }

  static parseDownloadLink(text: string): string | null {
    if (!text || !text.includes('nxm://')) return null;
    const cleaned = text.includes('&amp;') || text.includes('\\/') ? text.replace(/&amp;/g, '&').replace(/\\\//g, '/') : text;
    const m = cleaned.match(/nxm:\/\/[^\s"'<>]+/i);
    if (!m || !m[0].includes('?')) return null;
    const params = m[0].slice(m[0].indexOf('?') + 1);
    if (!params.includes('key') || !params.includes('expires')) return null;
    const p = new URLSearchParams(params);
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
    const timeoutMs = await RequestTimeout.configuredMs();

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
      const guard = RequestTimeout.arm(timeoutMs);
      try {
        const fullPopUpUrl = new URL(href, 'https://www.nexusmods.com').href;
        const targetUrl = isNMM && !fullPopUpUrl.includes('nmm=1') ? `${fullPopUpUrl}${fullPopUpUrl.includes('?') ? '&' : '?'}nmm=1` : fullPopUpUrl;
        const res = await fetch(targetUrl, { credentials: 'include', signal: guard.signal });
        const text = await res.text();

        if (this.isCloudflareChallenge(text, res.status)) {
          return { url: null, error: 'cloudflare-challenge', blockedUrl: targetUrl, rawText: text };
        }

        const direct = this.extractDirectDownloadFromText(text) || this.parseDownloadUrlFromResponse(text) || this.parseDownloadLink(text);
        if (direct) return { url: direct, rawText: text };
      } catch (err) {
        Logger.error('ModRequirementsPopUp direct href fetch error:', err);
      } finally {
        guard.clear();
      }
    }

    // 5. Primary API: GenerateDownloadUrl POST endpoint
    if (fileId) {
      const guard = RequestTimeout.arm(timeoutMs);
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
          credentials: 'include',
          signal: guard.signal
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
      } finally {
        guard.clear();
      }

      // 6. Fallback: Query all Nexus popup widget endpoints
      const widgets = ['DownloadPopUp', 'ModRequirementsPopUp', 'ModDownloadPopUp', 'RequirementsPopUp'];
      for (const widget of widgets) {
        const guard = RequestTimeout.arm(timeoutMs);
        try {
          const effectiveGid = numericGameId || gameId || '';
          const popUpUrl = `https://www.nexusmods.com/Core/Libs/Common/Widgets/${widget}?id=${encodeURIComponent(
            fileId
          )}&game_id=${encodeURIComponent(effectiveGid)}${isNMM ? '&nmm=1' : ''}`;

          const popUpRes = await fetch(popUpUrl, { credentials: 'include', signal: guard.signal });
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
        } finally {
          guard.clear();
        }
      }
    }
    // 7. Fallback: Fetch & scrape href HTML page
    if (href && !href.startsWith('nxm://')) {
      const guard = RequestTimeout.arm(timeoutMs);
      try {
        const fullHref = new URL(href, 'https://www.nexusmods.com').href;
        const targetUrl = isNMM && !fullHref.includes('nmm=1') ? `${fullHref}${fullHref.includes('?') ? '&' : '?'}nmm=1` : fullHref;
        const res = await fetch(targetUrl, { credentials: 'include', signal: guard.signal });
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
      } finally {
        guard.clear();
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

  static extractFilenameFromUrl(url: string): string | undefined {
    try {
      const last = new URL(url).pathname.split('/').pop() || '';
      const decoded = decodeURIComponent(last);
      return /\.[A-Za-z0-9]{1,10}$/.test(decoded) ? decoded : undefined;
    } catch {
      return undefined;
    }
  }

  static sendExternalDownload(
    url: string,
    filename?: string
  ): Promise<{ success: boolean; error?: string } | null> {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'EXTERNAL_DOWNLOAD', url, filename }, (response) => {
        if (chrome.runtime.lastError) {
          Logger.warn('EXTERNAL_DOWNLOAD message error:', chrome.runtime.lastError.message);
          resolve({ success: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response || { success: false, error: 'no response from background' });
      });
    });
  }

  // -------------------------------------------------------------------------
  // Vortex Handoff watchdog (issue #4, ADR-0004)
  // After handing an nxm:// link to the OS via location.href, watch for signs
  // that the external handler engaged (window blur / document hidden). If the
  // tab shows no sign of engagement within NXM_HANDOFF_WATCHDOG_MS, surface a
  // dismissible in-page notice offering to re-run the same file through the
  // Browser Download path. One pending watchdog at a time: a newer handoff
  // replaces the previous watch (and its notice) so overlays never stack.
  // -------------------------------------------------------------------------

  private static readonly NXM_HANDOFF_WATCHDOG_MS = 8000;
  private static readonly NXM_HANDOFF_NOTICE_ID = 'nextended-nxm-handoff-notice';

  private static nxmWatchdogTimer: number | null = null;
  private static nxmWatchdogEngagedListener: (() => void) | null = null;

  static armNxMHandoffWatchdog(nxmUrl: string, downloadViaBrowser: () => void): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    // Re-arm semantics: cancel any pending watch (and its notice) first.
    this.disarmNxMHandoffWatchdog();

    // Already hidden when arming — the handler likely stole focus before us.
    if (document.visibilityState === 'hidden') return;

    const onEngaged = () => {
      Logger.debug('nxm handoff watchdog: tab blurred or hidden — external handler engaged, canceling notice.');
      this.disarmNxMHandoffWatchdog();
    };
    window.addEventListener('blur', onEngaged);
    document.addEventListener('visibilitychange', onEngaged);
    this.nxmWatchdogEngagedListener = onEngaged;

    Logger.debug('Armed nxm handoff watchdog.', { url: nxmUrl, timeoutMs: this.NXM_HANDOFF_WATCHDOG_MS });

    this.nxmWatchdogTimer = window.setTimeout(() => {
      this.nxmWatchdogTimer = null;
      this.detachNxMEngagedListener();
      if (document.visibilityState === 'hidden') return;
      Logger.info('nxm handoff watchdog: no handler engagement detected — offering browser download fallback.');
      this.showNxMHandoffNotice(downloadViaBrowser);
    }, this.NXM_HANDOFF_WATCHDOG_MS);
  }

  static disarmNxMHandoffWatchdog(): void {
    if (this.nxmWatchdogTimer !== null) {
      clearTimeout(this.nxmWatchdogTimer);
      this.nxmWatchdogTimer = null;
    }
    this.detachNxMEngagedListener();
    if (typeof document !== 'undefined') this.removeNxMHandoffNotice();
  }

  private static detachNxMEngagedListener(): void {
    const listener = this.nxmWatchdogEngagedListener;
    if (!listener) return;
    if (typeof window !== 'undefined') window.removeEventListener('blur', listener);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', listener);
    this.nxmWatchdogEngagedListener = null;
  }

  private static removeNxMHandoffNotice(): void {
    document.getElementById(this.NXM_HANDOFF_NOTICE_ID)?.remove();
  }

  private static showNxMHandoffNotice(downloadViaBrowser: () => void): void {
    if (typeof document === 'undefined') return;
    this.removeNxMHandoffNotice();

    const overlay = document.createElement('div');
    overlay.id = this.NXM_HANDOFF_NOTICE_ID;
    overlay.style.cssText = `position:fixed;bottom:16px;right:16px;max-width:360px;box-sizing:border-box;` +
      `background-color:#242424;border:1px solid #444444;border-radius:6px;box-shadow:0 8px 24px rgba(0,0,0,0.6);` +
      `padding:14px;color:#eeeeee;z-index:999999;` +
      `font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;` +
      `font-size:13px;line-height:1.5;`;
    overlay.innerHTML = `
      <div style="display:flex;align-items:flex-start;gap:12px;">
        <div style="flex:1 1 auto;">
          <div style="font-size:12px;font-weight:700;letter-spacing:0.4px;text-transform:uppercase;color:#da8e35;">Vortex handoff appears stuck</div>
          <p style="margin:6px 0 0;">An nxm:// mod link was opened, but this tab never lost focus — no external mod manager picked it up. The nxm:// handler may be unconfigured.</p>
        </div>
        <button type="button" data-action="dismiss" style="flex:0 0 auto;background:transparent;border:none;color:#999999;font-size:12px;cursor:pointer;padding:2px 4px;">Dismiss</button>
      </div>
      <button type="button" data-action="browser-fallback" style="display:block;width:100%;margin-top:12px;background-color:#da8e35;color:#ffffff;border:none;border-radius:4px;padding:8px 12px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.4px;cursor:pointer;">Download via browser instead</button>
    `;

    overlay.querySelector('[data-action="dismiss"]')?.addEventListener('click', () => overlay.remove());
    overlay.querySelector('[data-action="browser-fallback"]')?.addEventListener('click', () => {
      overlay.remove();
      Logger.info('nxm handoff fallback: re-running the same file through the browser download path.');
      downloadViaBrowser();
    });

    document.body.appendChild(overlay);
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
        // VPN & Cloudflare fallback mode: navigate to the blocked URL so the user
        // can solve the challenge naturally instead of seeing an error.
        if (config.vpnMode && result.blockedUrl && typeof location !== 'undefined') {
          Logger.info('VPN mode active: redirecting to blocked URL to resolve Cloudflare challenge:', result.blockedUrl);
          if (btn) this.setButtonState(btn, 'downloading');
          location.assign(result.blockedUrl);
          if (btn) this.restoreButtonState(btn);
          return;
        }

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
      if (result.url.startsWith('nxm://')) {
        this.armNxMHandoffWatchdog(result.url, () => {
          void this.startDownloadFlow({ ...opts, isNMM: false });
        });
      }
    } else {
      const filename = this.extractFilenameFromUrl(result.url);
      let handled = false;
      if (config.externalDownloader.enabled) {
        const external = await this.sendExternalDownload(result.url, filename);
        if (external?.success) {
          Logger.info(`Handed off to ${config.externalDownloader.mode} downloader:`, filename || result.url);
          handled = true;
        } else if (external) {
          Logger.warn('External downloader failed, falling back to browser download:', external?.error);
        }
      }
      if (!handled) {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          const modMatch = typeof location !== 'undefined' ? location.pathname.match(/\/mods\/(\d+)/) : null;
          chrome.runtime.sendMessage({
            type: 'TRIGGER_DOWNLOAD',
            url: result.url,
            filename,
            modId: modMatch ? modMatch[1] : undefined
          });
        } else {
          const a = document.createElement('a');
          a.href = result.url;
          if (filename) a.download = filename;
          a.click();
        }
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
