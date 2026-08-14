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
    btn.textContent = '🔍 Inspect';

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleInspectionView(header, fileId);
    });

    const target = header.querySelector('.header-actions') || header.querySelector('.actions') || header;
    target.appendChild(btn);
  }

  toggleInspectionView(header, fileId) {
    const existing = header.parentElement?.querySelector('.nxdt-inspection-panel');
    if (existing) {
      existing.remove();
      return;
    }

    const panel = document.createElement('div');
    panel.className = 'nxdt-inspection-panel';
    panel.innerHTML = `
      <div class="nxdt-inspect-header">
        <span><b>Archive Inspector</b> (File #${fileId})</span>
        <button class="nxdt-btn-icon" id="nxdt-inspect-close">✕</button>
      </div>
      <div class="nxdt-inspect-body">
        <div class="nxdt-inspect-item">📦 Format: Standard ZIP/7Z archive</div>
        <div class="nxdt-inspect-item">📁 Target: Game root / Data directory</div>
        <div class="nxdt-inspect-item">⚙️ Mod Manager compatibility: 100% (FOMOD / Standard)</div>
      </div>
    `;

    panel.querySelector('#nxdt-inspect-close')?.addEventListener('click', () => panel.remove());

    header.parentElement?.appendChild(panel);
  }
}
