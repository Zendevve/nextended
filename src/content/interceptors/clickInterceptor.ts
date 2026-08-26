import { StorageManager } from '../../common/storage';
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
    if (el.dataset?.nnwppIsNmm !== undefined) return el.dataset.nnwppIsNmm === '1';
    if (el.id === 'action-vortex' || el.id === 'action-nmm') return true;
    const text = (el.textContent || el.getAttribute('aria-label') || '').toLowerCase();
    return /vortex|mod manager|manager download/i.test(text);
  }

  static extractFileId(href: string): string | null {
    try {
      if (href.startsWith('nxm://')) {
        const queryIndex = href.indexOf('?');
        if (queryIndex !== -1) {
          const params = new URLSearchParams(href.substring(queryIndex));
          return params.get('id') || params.get('file_id');
        }
      }
      const url = new URL(href, location.href);
      return (
        url.searchParams.get('id') ||
        url.searchParams.get('file_id') ||
        url.pathname.match(/\/api\/files\/(\d+)/)?.[1] ||
        null
      );
    } catch {
      return null;
    }
  }

  static getGameId(el: HTMLElement | null): string {
    let curr: HTMLElement | null = el;
    while (curr) {
      if (['MOD-DOWNLOAD-BUTTONS', 'MOD-FILE-DOWNLOAD'].includes(curr.tagName) && curr.getAttribute('game-id')) {
        return curr.getAttribute('game-id') || '';
      }
      curr = curr.parentElement;
    }
    const dataEl = document.querySelector('[data-game-id], [game-id]') as HTMLElement | null;
    if (dataEl) return dataEl.dataset.gameId || dataEl.getAttribute('game-id') || '';
    for (const script of document.querySelectorAll('script')) {
      const match = script.textContent?.match(/game_id\s*:\s*(\d+)/) || script.textContent?.match(/gameId\s*:\s*(\d+)/);
      if (match) return match[1];
    }
    const section = document.getElementById('section');
    return section?.dataset?.gameId || location.pathname.split('/')[1] || '';
  }

  static attach() {
    if (this.attached) return;
    this.attached = true;

    document.body.addEventListener(
      'click',
      async (event: MouseEvent) => {
        if (!/\/mods\/\d+/.test(location.pathname) || !event.isTrusted || event.defaultPrevented) return;

        const path = event.composedPath ? (event.composedPath() as HTMLElement[]) : [event.target as HTMLElement];
        const el =
          path.find((n) => n?.tagName === 'A' || n?.tagName === 'BUTTON') ||
          (event.target as HTMLElement).closest('a,button');

        if (!el || el.closest('.pagination, .comment-container, .forum-post, .search-results, #ndc-container')) return;

        const href = el.getAttribute('href') || (el as HTMLAnchorElement).href || '';
        if (el.classList.contains('popup-btn-ajax') && !RequirementsBypass.isRequirementsUrl(href)) return;
        if (href.includes('tab=files') && !href.includes('file_id=')) return;

        const isNMM = this.isNMMDownload(el, href);
        el.dataset.nnwppIsNmm = isNMM ? '1' : '0';

        let fileId = this.extractFileId(href);
        let secureApiUrl: string | null = null;

        const modal =
          path.find((n) => n?.tagName === 'MOD-DOWNLOAD-MODAL') ||
          path.find((n) => (n as HTMLElement)?.shadowRoot?.querySelector('mod-download-modal'))?.shadowRoot?.querySelector('mod-download-modal') ||
          path.find((n) => ['MOD-DOWNLOAD-BUTTONS', 'MOD-FILE-DOWNLOAD'].includes(n?.tagName))?.querySelector('mod-download-modal');

        if (modal) {
          try {
            const fd = JSON.parse(modal.getAttribute('file') || '{}');
            if (fd.downloadUrl) {
              secureApiUrl = isNMM ? fd.vortexDownloadUrl || fd.downloadUrl : fd.downloadUrl;
            }
          } catch {}
        }

        const hostContainer = path.find((n) => ['MOD-DOWNLOAD-BUTTONS', 'MOD-FILE-DOWNLOAD'].includes(n?.tagName));
        if (!secureApiUrl && hostContainer) {
          try {
            const attr = hostContainer.tagName === 'MOD-DOWNLOAD-BUTTONS' ? 'main-file' : 'file';
            const fd = JSON.parse(hostContainer.getAttribute(attr) || '{}');
            if (fd.id && !fileId) fileId = fd.id.toString();
          } catch {}
        }

        const isDownloadHref =
          RequirementsBypass.isRequirementsUrl(href) ||
          ['tab=files&file_id=', 'file_id=', '/api/files/', 'nxm://'].some((p) => href.toLowerCase().includes(p));

        if (!(fileId || secureApiUrl || isDownloadHref || (modal && (isNMM || (el.textContent || '').toLowerCase().includes('manual'))))) {
          return;
        }

        if (this.processing.has(el) || (el.textContent || '').toLowerCase().includes('slow download')) {
          return;
        }

        this.processing.add(el);
        event.preventDefault();
        event.stopImmediatePropagation();

        try {
          const gameId = this.getGameId(el);
          await SingleDownloader.startDownloadFlow({
            btn: el,
            fileId: secureApiUrl ? null : fileId,
            gameId,
            isNMM,
            href: secureApiUrl || href || `https://www.nexusmods.com${location.pathname}?tab=files&file_id=${fileId}`
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
