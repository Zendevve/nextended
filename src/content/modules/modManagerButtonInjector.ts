import { StorageManager } from '../../common/storage';
import { Logger } from '../../common/logger';
import { ClickInterceptor } from '../interceptors/clickInterceptor';

export class ModManagerButtonInjector {
  private static handled = new WeakSet<Element>();

  static async inject() {
    const config = await StorageManager.getConfig();
    if (!config.forceModManagerDownload || !/\/mods\/\d+/.test(location.pathname)) return;

    // Only the files tab hosts file entries; the default view (no tab param) is files too.
    const tab = new URLSearchParams(location.search).get('tab');
    if (tab && tab !== 'files') return;

    // Modern accordion layout: expander headers pair with their downloads box.
    const headers = document.querySelectorAll('.file-expander-header');
    const boxes = document.querySelectorAll('.accordion-downloads');
    headers.forEach((header, i) => {
      const fileId = (header as HTMLElement).dataset?.id;
      const box = boxes[i];
      if (fileId && box) this.injectIntoActionArea(box, fileId);
    });

    // Classic accordion lists: dt[data-id] entries with the following dd as action area.
    document.querySelectorAll('.accordionitems dt[data-id]').forEach((dt) => {
      const area = dt.nextElementSibling;
      if (area) this.injectIntoActionArea(area, dt.getAttribute('data-id') || '');
    });
  }

  private static injectIntoActionArea(area: Element, fileId: string) {
    if (this.handled.has(area)) return;

    // Native manager control already present (nmm=1 link or vortex/manager-labeled
    // control) → leave the entry exactly as the page rendered it.
    const controls = Array.from(area.querySelectorAll<HTMLElement>('a, button'));
    if (controls.some((el) => ClickInterceptor.isNMMDownload(el, el.getAttribute('href') || ''))) {
      this.handled.add(area);
      return;
    }

    // Idempotence backstop for re-rendered areas the WeakSet cannot know.
    if (area.querySelector('a[data-nextended-manager-btn]')) {
      this.handled.add(area);
      return;
    }

    // Reuse the entry's own file link with nmm=1 appended so the existing
    // ClickInterceptor resolves the click as a manager download — no new download path.
    const fileLink = this.findFileLink(area, fileId);
    if (!fileLink) return; // not a manual-only entry (yet) — retry on a later scan

    const base = fileLink.getAttribute('href') || '';
    const btn = document.createElement('a');
    btn.className = 'btn inline-flex';
    btn.dataset.nextendedManagerBtn = 'true';
    btn.href = base + (base.includes('?') ? '&' : '?') + 'nmm=1';
    btn.style.cssText = 'margin-right:8px;';
    btn.innerHTML = '<span class="flex-label">Mod manager download</span>';
    area.insertBefore(btn, area.firstChild);

    this.handled.add(area);
    Logger.debug('Injected mod manager download button for file', fileId);
  }

  private static findFileLink(area: Element, fileId: string): HTMLAnchorElement | null {
    const idFromHref = (href: string): string | null => {
      const query = /[?&](?:file_id|fid|id)=(\d+)/i.exec(href);
      if (query) return query[1];
      const path = /\/files\/(\d+)/i.exec(href);
      return path ? path[1] : null;
    };
    return (
      Array.from(area.querySelectorAll<HTMLAnchorElement>('a[href]')).find(
        (a) => idFromHref(a.getAttribute('href') || '') === fileId
      ) || null
    );
  }
}
