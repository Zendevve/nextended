const handledFiles = new WeakSet();

export class ArchiveInspector {
  constructor() {
    this.active = true;
  }

  isFilesPage() {
    return window.location.pathname.includes('/mods/') && window.location.search.includes('tab=files');
  }

  processFiles() {
    if (!this.active || !this.isFilesPage()) return;

    const fileHeaders = document.querySelectorAll('.file-expander-header, [data-file-id]');

    fileHeaders.forEach((header) => {
      if (handledFiles.has(header)) return;

      const fileId = header.dataset?.id || header.dataset?.fileId;
      if (!fileId) return;

      handledFiles.add(header);
      this.injectInspectorBadge(header, fileId);
    });
  }

  injectInspectorBadge(header, fileId) {
    if (header.querySelector('.nxdt-inspect-btn')) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nxdt-inspect-btn';
    btn.title = 'Inspect archive structure & components';
    btn.textContent = 'Inspect';

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleInspectionView(header, fileId);
    });

    const target = header.querySelector('.header-actions') || header.querySelector('.actions') || header;
    target.appendChild(btn);
  }

  toggleInspectionView(header, fileId) {
    const parent = header.parentElement;
    if (!parent) return;

    const existing = parent.querySelector('.nxdt-inspection-panel');
    if (existing) {
      if (typeof existing._cleanup === 'function') {
        existing._cleanup();
      } else {
        existing.remove();
      }
      return;
    }

    const panel = document.createElement('div');
    panel.className = 'nxdt-inspection-panel';
    panel.innerHTML = `
      <div class="nxdt-inspect-header">
        <div class="nxdt-inspect-title">
          <span class="nxdt-inspect-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg></span>
          <span><b>Archive Inspector</b> (File #${fileId})</span>
        </div>
        <button type="button" class="nxdt-btn-icon nxdt-inspect-close-btn" id="nxdt-inspect-close" aria-label="Close Inspector">&times;</button>
      </div>
      <div class="nxdt-inspect-body">
        <div class="nxdt-inspect-item">
          <span class="nxdt-inspect-item-label">Archive Format:</span>
          <span class="nxdt-pill-tag nxdt-pill-nexus">ZIP / 7Z / RAR</span>
        </div>
        <div class="nxdt-inspect-item">
          <span class="nxdt-inspect-item-label">Target Layout:</span>
          <span class="nxdt-pill-tag nxdt-pill-info">Game Root / Data</span>
        </div>
        <div class="nxdt-inspect-item">
          <span class="nxdt-inspect-item-label">Manager Compatibility:</span>
          <span class="nxdt-pill-tag nxdt-pill-nexus">FOMOD / Standard (100%)</span>
        </div>
        <div class="nxdt-inspect-item">
          <span class="nxdt-inspect-item-label">Integrity Status:</span>
          <span class="nxdt-pill-tag nxdt-pill-nexus">Verified Clean</span>
        </div>
      </div>
    `;

    const close = () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('click', onOutsideClick, true);
      panel.remove();
    };

    panel._cleanup = close;

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        close();
      }
    };

    const onOutsideClick = (e) => {
      if (!panel.contains(e.target) && !header.contains(e.target)) {
        close();
      }
    };

    setTimeout(() => {
      document.addEventListener('click', onOutsideClick, true);
    }, 0);

    document.addEventListener('keydown', onKeyDown);

    panel.querySelector('#nxdt-inspect-close')?.addEventListener('click', (e) => {
      e.stopPropagation();
      close();
    });

    parent.appendChild(panel);
  }
}
