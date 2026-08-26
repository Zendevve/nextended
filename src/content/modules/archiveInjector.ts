import { StorageManager } from '../../common/storage';

export class ArchiveInjector {
  private static handled = new WeakSet<Element>();

  static async inject() {
    const config = await StorageManager.getConfig();
    if (!config.handleArchivedFiles || !/\/mods\/\d+/.test(location.pathname)) return;

    const url = location.href;

    // Handle "File archive" button insertion in tab footer
    if (url.includes('tab=files') && !url.includes('category=archived')) {
      const footer = document.querySelector('#files-tab-footer');
      if (footer && !this.handled.has(footer)) {
        this.handled.add(footer);
        const existingBtn = Array.from(footer.querySelectorAll('a.btn.inline-flex .flex-label')).some(
          (el) => el.textContent?.trim() === 'File archive'
        );
        if (!existingBtn) {
          const btn = document.createElement('a');
          btn.className = 'btn inline-flex';
          btn.dataset.archivedBtn = 'true';
          btn.href = `${url}&category=archived`;
          btn.style.cssText = 'background:#da8e35;color:#fff;margin-left:8px;';
          btn.innerHTML = '<span class="flex-label">File archive</span>';
          footer.appendChild(btn);
        }
      }
    }

    if (!url.includes('category=archived')) return;

    // Inject buttons into accordion files
    const headers = document.querySelectorAll('.file-expander-header');
    const boxes = document.querySelectorAll('.accordion-downloads');

    headers.forEach((h, i) => {
      const box = boxes[i] as HTMLElement | undefined;
      const fileId = (h as HTMLElement)?.dataset?.id;
      if (!fileId || !box || this.handled.has(box) || box.querySelector('p') || h.querySelector('.icon-tickunsafe')) {
        return;
      }

      this.handled.add(box);
      const safeBase = `${location.origin}${location.pathname}`;
      box.innerHTML = `
        <a class="btn inline-flex" href="${safeBase}?tab=files&file_id=${fileId}&nmm=1"><span class="flex-label">Mod manager download</span></a>
        <a class="btn inline-flex" href="${safeBase}?tab=files&file_id=${fileId}"><span class="flex-label">Manual download</span></a>
      `;
    });

    // Also support classic .accordionitems lists
    const accordionItems = document.querySelectorAll('.accordionitems');
    accordionItems.forEach((fileList) => {
      if (this.handled.has(fileList)) return;
      this.handled.add(fileList);

      const dts = fileList.querySelectorAll('dt');
      let gameId = '';
      if ('current_game_id' in window && typeof window.current_game_id === 'string') {
        gameId = window.current_game_id;
      }

      dts.forEach((dt) => {
        const dataId = dt.getAttribute('data-id');
        const next = dt.nextElementSibling;
        if (dataId && next && !next.querySelector('.allow-archive-downloads-wrapper')) {
          const wrapper = document.createElement('div');
          wrapper.className = 'allow-archive-downloads-wrapper tabbed-block';
          wrapper.innerHTML = `
            <ul class="accordion-downloads clearfix">
              <li>
                <a class="btn inline-flex popup-btn-ajax" href="/Core/Libs/Common/Widgets/ModRequirementsPopUp?id=${dataId}&game_id=${gameId}&nmm=1">
                  <span class="flex-label">Mod manager download</span>
                </a>
              </li>
              <li>
                <a class="btn inline-flex popup-btn-ajax" href="/Core/Libs/Common/Widgets/ModRequirementsPopUp?id=${dataId}&game_id=${gameId}">
                  <span class="flex-label">Manual download</span>
                </a>
              </li>
            </ul>
          `;
          next.appendChild(wrapper);
        }
      });
    });
  }
}
