import { GraphQLClient } from '../modules/graphQLClient';
import { RequirementsBypass } from './requirementsBypass';
import { SingleDownloader } from '../modules/singleDownloader';
import { Logger } from '../../common/logger';

export class ClickInterceptor {
  private static processing = new WeakSet<HTMLElement>();
  private static attached = false;

  static isNMMDownload(el: HTMLElement | null, href = ''): boolean {
    if (href && (href.startsWith('nxm://') || href.includes('nmm=1') || href.includes('&nmm=1'))) {
      return true;
    }
    if (!el) return false;
    if (el.dataset?.nextendedIsNmm !== undefined) return el.dataset.nextendedIsNmm === '1';
    if (el.id === 'action-vortex' || el.id === 'action-nmm') return true;
    const text = (el.textContent || el.getAttribute('aria-label') || el.getAttribute('title') || '').toLowerCase();
    return /vortex|mod manager|manager download/i.test(text);
  }

  static extractFileId(href = '', el: HTMLElement | null = null): string | null {
    // 1. Check direct attributes on element
    if (el) {
      const directId =
        el.dataset?.fileId ||
        el.dataset?.id ||
        el.dataset?.fileid ||
        el.getAttribute('data-id') ||
        el.getAttribute('data-file-id') ||
        el.getAttribute('file-id') ||
        el.getAttribute('data-fileid') ||
        el.getAttribute('data-fid') ||
        el.getAttribute('file_id');
      if (directId && /^\d+$/.test(directId)) return directId;

      // Check JSON attributes on element: main-file or file
      for (const attr of ['main-file', 'file', 'data-file', 'data-main-file']) {
        const val = el.getAttribute(attr);
        if (val) {
          try {
            const parsed = JSON.parse(val);
            const fid = parsed?.id || parsed?.fileId || parsed?.file_id || parsed?.fid;
            if (fid && /^\d+$/.test(String(fid))) return String(fid);
          } catch {}
        }
      }

      // 2. Check parent container elements
      const parentContainer = el.closest(
        '[data-id], [data-file-id], [file-id], [data-fileid], [data-fid], [main-file], [file], .file-expander-header, .accordion-card, .file-item, .mod-file-download, mod-download-buttons, mod-file-download, MOD-DOWNLOAD-BUTTONS, MOD-FILE-DOWNLOAD, mod-download-modal, MOD-DOWNLOAD-MODAL'
      ) as HTMLElement | null;

      if (parentContainer) {
        const pid =
          parentContainer.dataset?.fileId ||
          parentContainer.dataset?.id ||
          parentContainer.dataset?.fileid ||
          parentContainer.getAttribute('data-id') ||
          parentContainer.getAttribute('data-file-id') ||
          parentContainer.getAttribute('file-id') ||
          parentContainer.getAttribute('data-fileid') ||
          parentContainer.getAttribute('data-fid') ||
          parentContainer.getAttribute('file_id');
        if (pid && /^\d+$/.test(pid)) return pid;

        for (const attr of ['main-file', 'file', 'data-file', 'data-main-file']) {
          const val = parentContainer.getAttribute(attr);
          if (val) {
            try {
              const parsed = JSON.parse(val);
              const fid = parsed?.id || parsed?.fileId || parsed?.file_id || parsed?.fid;
              if (fid && /^\d+$/.test(String(fid))) return String(fid);
            } catch {}
          }
        }
      }

      // Check data-download-url on element or parent
      const dataDlUrl = el.getAttribute('data-download-url') || parentContainer?.getAttribute('data-download-url');
      if (dataDlUrl) {
        const idMatch = dataDlUrl.match(/(?:file_id|id|fid)=(\d+)/i) || dataDlUrl.match(/\/files\/(\d+)/i);
        if (idMatch && idMatch[1]) return idMatch[1];
      }
    }

    // 3. Check href if provided
    if (href) {
      try {
        if (href.startsWith('nxm://')) {
          const queryIndex = href.indexOf('?');
          if (queryIndex !== -1) {
            const params = new URLSearchParams(href.substring(queryIndex));
            const id = params.get('id') || params.get('file_id') || params.get('fid');
            if (id && /^\d+$/.test(id)) return id;
          }
          const pathMatch = href.match(/\/files\/(\d+)/i);
          if (pathMatch && pathMatch[1]) return pathMatch[1];
        }

        const base = typeof location !== 'undefined' ? location.href : 'https://www.nexusmods.com';
        const url = new URL(href, base);
        const id =
          url.searchParams.get('id') ||
          url.searchParams.get('file_id') ||
          url.searchParams.get('fid') ||
          url.pathname.match(/\/api\/files\/(\d+)/)?.[1] ||
          url.pathname.match(/\/files\/(\d+)/)?.[1];
        if (id && /^\d+$/.test(id)) return id;
      } catch {
        const directMatch = href.match(/(?:file_id|id|fid)=(\d+)/i) || href.match(/\/files\/(\d+)/i);
        if (directMatch && directMatch[1]) return directMatch[1];
      }
    }

    // 4. Fallback: URL search params on current location
    if (typeof location !== 'undefined' && location.search) {
      try {
        const params = new URLSearchParams(location.search);
        const queryId = params.get('file_id') || params.get('id') || params.get('fid');
        if (queryId && /^\d+$/.test(queryId)) return queryId;
      } catch {}
    }

    // 5. Fallback: DOM query for slowDownloadButton, [data-download-url], input#dl_link
    if (typeof document !== 'undefined') {
      const slowBtn = document.querySelector('#slowDownloadButton, [data-download-url], input#dl_link') as HTMLElement | null;
      if (slowBtn) {
        const dlUrl = slowBtn.getAttribute('data-download-url') || (slowBtn as HTMLInputElement).value || slowBtn.getAttribute('href') || '';
        const idMatch = dlUrl.match(/(?:file_id|id|fid)=(\d+)/i) || dlUrl.match(/\/files\/(\d+)/i);
        if (idMatch && idMatch[1]) return idMatch[1];

        const btnFileId =
          slowBtn.dataset?.fileId ||
          slowBtn.dataset?.id ||
          slowBtn.getAttribute('data-id') ||
          slowBtn.getAttribute('data-file-id') ||
          slowBtn.getAttribute('file-id');
        if (btnFileId && /^\d+$/.test(btnFileId)) return btnFileId;
      }
    }

    return null;
  }
  static async resolveFileId(el: HTMLElement | null = null, href = ''): Promise<string | null> {
    const direct = this.extractFileId(href, el);
    if (direct && /^\d+$/.test(direct)) return direct;

    // Check NEXT_DATA for primary / main file
    if (typeof document !== 'undefined') {
      const nextDataScript = document.getElementById('__NEXT_DATA__');
      if (nextDataScript?.textContent) {
        try {
          const data = JSON.parse(nextDataScript.textContent);
          const pageProps = data?.props?.pageProps;
          const files = pageProps?.files || pageProps?.modFiles || pageProps?.mod?.modFiles;
          if (Array.isArray(files) && files.length > 0) {
            const primary = files.find((f: { isPrimary?: boolean; categoryName?: string; category_name?: string }) =>
              f.isPrimary || f.categoryName === 'MAIN' || f.category_name === 'MAIN'
            ) || files[0];
            const fid = primary?.id || primary?.fileId || primary?.file_id;
            if (fid && /^\d+$/.test(String(fid))) return String(fid);
          }
          const singleFile = pageProps?.file || pageProps?.mainFile;
          const singleFid = singleFile?.id || singleFile?.fileId || singleFile?.file_id;
          if (singleFid && /^\d+$/.test(String(singleFid))) return String(singleFid);
        } catch {}
      }

      // Check first file card in DOM
      const firstCard = document.querySelector('.file-expander-header[data-id], [data-file-id], [data-fid]');
      if (firstCard) {
        const cid = firstCard.getAttribute('data-id') || firstCard.getAttribute('data-file-id') || firstCard.getAttribute('data-fid');
        if (cid && /^\d+$/.test(cid)) return cid;
      }
    }

    // Check GraphQL for mod's primary file ID using mod ID from URL
    if (typeof location !== 'undefined') {
      const modMatch = location.pathname.match(/\/mods\/(\d+)/);
      if (modMatch && modMatch[1]) {
        const modId = parseInt(modMatch[1], 10);
        const segs = location.pathname.split('/').filter(Boolean);
        const domain = segs[0] === 'games' ? segs[1] : segs[0];
        if (domain && domain !== 'mods' && modId) {
          try {
            const fetchedFid = await GraphQLClient.fetchPrimaryModFileId(domain, modId);
            if (fetchedFid && /^\d+$/.test(fetchedFid)) return fetchedFid;
          } catch {}
        }
      }
    }

    return direct || null;
  }


  static getGameIdFromContext(): string {
    if (typeof document === 'undefined') return '';

    const directMeta = document.querySelector('meta[name="game-id"]') as HTMLMetaElement | null;
    if (directMeta?.content && /^\d+$/.test(directMeta.content)) return directMeta.content;

    const nextDataScript = document.getElementById('__NEXT_DATA__');
    if (nextDataScript?.textContent) {
      try {
        const data = JSON.parse(nextDataScript.textContent);
        const fromProps = data?.props?.pageProps?.game?.id || data?.props?.pageProps?.gameId;
        if (fromProps && /^\d+$/.test(String(fromProps))) return String(fromProps);
      } catch {}
    }

    if (typeof window !== 'undefined') {
      const win = window as unknown as Record<string, unknown>;
      const winGameId = win.current_game_id || win.gameId || win.game_id;
      if (winGameId && /^\d+$/.test(String(winGameId))) return String(winGameId);
    }

    if (typeof location !== 'undefined' && location.search) {
      const queryGid = new URLSearchParams(location.search).get('game_id');
      if (queryGid && /^\d+$/.test(queryGid)) return queryGid;
    }

    const section = document.getElementById('section');
    const sectionGid = section?.dataset?.gameId;
    if (sectionGid && /^\d+$/.test(sectionGid)) return sectionGid;

    return '';
  }

  static getGameId(el: HTMLElement | null = null): string {
    if (typeof document === 'undefined') return '';

    let curr: HTMLElement | null = el;
    while (curr) {
      if (['MOD-DOWNLOAD-BUTTONS', 'MOD-FILE-DOWNLOAD'].includes(curr.tagName.toUpperCase()) && curr.getAttribute('game-id')) {
        return curr.getAttribute('game-id') || '';
      }
      const gAttr = curr.getAttribute('data-game-id') || curr.getAttribute('game-id') || curr.dataset?.gameId;
      if (gAttr) return gAttr;
      curr = curr.parentElement;
    }

    const dataEl = document.querySelector('[data-game-id], [game-id]') as HTMLElement | null;
    if (dataEl) {
      const v = dataEl.dataset.gameId || dataEl.getAttribute('game-id') || dataEl.getAttribute('data-game-id') || '';
      if (v) return v;
    }

    const meta = document.querySelector('meta[name="game-id"]') as HTMLMetaElement | null;
    if (meta?.content) return meta.content;

    for (const script of document.querySelectorAll('script')) {
      const match = script.textContent?.match(/game_id\s*:\s*(\d+)/) || script.textContent?.match(/gameId\s*:\s*(\d+)/);
      if (match) return match[1];
    }

    const section = document.getElementById('section');
    if (section?.dataset?.gameId) return section.dataset.gameId;

    if (typeof location !== 'undefined') {
      const segs = location.pathname.split('/').filter(Boolean);
      if (segs[0] === 'games' && segs[1]) return segs[1];
      if (segs[0] && segs[0] !== 'mods') return segs[0];
    }

    return '';
  }

  static async resolveGameId(el: HTMLElement | null = null): Promise<string> {
    const direct = this.getGameId(el);
    if (direct && /^\d+$/.test(direct)) return direct;

    const ctx = this.getGameIdFromContext();
    if (ctx && /^\d+$/.test(ctx)) return ctx;

    const candidate = direct || (typeof location !== 'undefined' ? location.pathname.split('/').filter(Boolean)[0] : '');
    if (candidate && candidate !== 'games' && candidate !== 'mods') {
      if (/^\d+$/.test(candidate)) return candidate;
      try {
        const fetched = await GraphQLClient.fetchGameId(candidate);
        if (fetched) return fetched;
      } catch {}
    }

    if (typeof location !== 'undefined') {
      const segs = location.pathname.split('/').filter(Boolean);
      const slug = segs[0] === 'games' ? segs[1] : segs[0];
      if (slug && slug !== candidate && slug !== 'mods') {
        try {
          const fetched = await GraphQLClient.fetchGameId(slug);
          if (fetched) return fetched;
        } catch {}
      }
    }

    return direct || candidate || '';
  }

  static isDownloadButtonOrLink(el: HTMLElement, href: string): boolean {
    if (el.id === 'slowDownloadButton' || el.id === 'fastDownloadButton' || el.id === 'action-vortex' || el.id === 'action-nmm' || el.id === 'action-manual') {
      return true;
    }
    if (el.hasAttribute('data-download-url') || el.closest('[data-download-url]')) {
      return true;
    }
    if (
      RequirementsBypass.isRequirementsUrl(href) ||
      ['tab=files&file_id=', 'file_id=', '/api/files/', 'nxm://', 'GenerateDownloadUrl'].some((p) => href.toLowerCase().includes(p))
    ) {
      return true;
    }
    const text = (el.textContent || el.getAttribute('aria-label') || el.getAttribute('title') || '').trim().toLowerCase();
    if (/slow download|manual download|fast download|vortex|mod manager download|^download$|^manual$/i.test(text)) {
      return true;
    }
    if (el.classList.contains('popup-btn-ajax') || el.classList.contains('btn-download') || el.classList.contains('btn-slow') || el.classList.contains('btn-manual')) {
      return true;
    }
    if (el.closest('mod-download-buttons, mod-file-download, MOD-DOWNLOAD-BUTTONS, MOD-FILE-DOWNLOAD, mod-download-modal, MOD-DOWNLOAD-MODAL, .file-expander-header, .mod-download-buttons, .mod-file-download')) {
      if (/download|vortex|manual|slow|fast/i.test(text) || el.tagName === 'BUTTON' || el.tagName === 'A') {
        return true;
      }
    }
    return false;
  }

  static attach() {
    if (this.attached) return;
    this.attached = true;

    document.body.addEventListener(
      'click',
      async (event: MouseEvent) => {
        if (!event.isTrusted || event.defaultPrevented) return;

        const path = event.composedPath ? (event.composedPath() as HTMLElement[]) : [event.target as HTMLElement];
        const el =
          path.find((n) => n?.tagName === 'A' || n?.tagName === 'BUTTON' || (n?.hasAttribute && n.hasAttribute('data-download-url')) || n?.id === 'slowDownloadButton') ||
          ((event.target as HTMLElement).closest('a, button, [data-download-url], #slowDownloadButton') as HTMLElement | null);

        if (!el || el.closest('.pagination, .comment-container, .forum-post, .search-results, #nextended-collection-container')) return;

        const href = el.getAttribute('href') || (el as HTMLAnchorElement).href || '';
        if (href.includes('tab=files') && !href.includes('file_id=') && !el.hasAttribute('data-download-url') && el.id !== 'slowDownloadButton' && !/download|vortex|manual|slow|fast/i.test(el.textContent || '')) return;

        if (!this.isDownloadButtonOrLink(el, href)) return;

        const isNMM = this.isNMMDownload(el, href);
        el.dataset.nextendedIsNmm = isNMM ? '1' : '0';

        let fileId = await this.resolveFileId(el, href);
        const dataDownloadUrl = el.getAttribute('data-download-url') || el.closest('[data-download-url]')?.getAttribute('data-download-url') || null;
        let secureApiUrl: string | null = null;

        const modal =
          path.find((n) => n?.tagName?.toUpperCase() === 'MOD-DOWNLOAD-MODAL') ||
          path.find((n) => (n as HTMLElement)?.shadowRoot?.querySelector('mod-download-modal'))?.shadowRoot?.querySelector('mod-download-modal') ||
          path.find((n) => ['MOD-DOWNLOAD-BUTTONS', 'MOD-FILE-DOWNLOAD'].includes(n?.tagName?.toUpperCase()))?.querySelector('mod-download-modal');

        if (modal) {
          try {
            const fd = JSON.parse(modal.getAttribute('file') || '{}');
            if (fd.downloadUrl) {
              secureApiUrl = isNMM ? fd.vortexDownloadUrl || fd.downloadUrl : fd.downloadUrl;
            }
            if (fd.id && !fileId) fileId = fd.id.toString();
          } catch {}
        }

        const hostContainer = path.find((n) => ['MOD-DOWNLOAD-BUTTONS', 'MOD-FILE-DOWNLOAD'].includes(n?.tagName?.toUpperCase()));
        if (hostContainer) {
          try {
            const attr = hostContainer.tagName.toUpperCase() === 'MOD-DOWNLOAD-BUTTONS' ? 'main-file' : 'file';
            const fd = JSON.parse(hostContainer.getAttribute(attr) || '{}');
            if (fd.id && !fileId) fileId = fd.id.toString();
            if (fd.downloadUrl && !secureApiUrl) {
              secureApiUrl = isNMM ? fd.vortexDownloadUrl || fd.downloadUrl : fd.downloadUrl;
            }
          } catch {}
        }

        if (!fileId && !dataDownloadUrl && !secureApiUrl) {
          fileId = await this.resolveFileId(null, '');
        }

        if (this.processing.has(el)) {
          return;
        }

        this.processing.add(el);
        event.preventDefault();
        event.stopImmediatePropagation();

        try {
          const gameId = await this.resolveGameId(el);
          const effectiveHref = dataDownloadUrl || secureApiUrl || href || (fileId ? `https://www.nexusmods.com${location.pathname}?tab=files&file_id=${fileId}` : location.href);
          await SingleDownloader.startDownloadFlow({
            btn: el,
            fileId,
            gameId,
            isNMM,
            href: effectiveHref
          });
        } catch (e) {
          Logger.error('ClickInterceptor startDownloadFlow error:', e);
        } finally {
          this.processing.delete(el);
        }
      },
      true
    );
  }
}
