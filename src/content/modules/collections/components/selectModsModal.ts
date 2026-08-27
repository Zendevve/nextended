import { CollectionModFile } from '../../../../common/types';

export class SelectModsModalComponent {
  element: HTMLElement;
  private mods: CollectionModFile[];
  private onDownloadSelected: (selected: CollectionModFile[]) => void;
  private totalSizeEl!: HTMLElement;


  constructor(mods: CollectionModFile[], onDownloadSelected: (selected: CollectionModFile[]) => void) {
    this.mods = mods;
    this.onDownloadSelected = onDownloadSelected;

    this.element = document.createElement('div');
    this.element.className = 'nextended-modal fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4';
    this.renderInitialHTML();
  }

  private formatSize(kb: number): string {
    const mb = kb / 1024;
    return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(2)} MB`;
  }

  private renderInitialHTML() {
    this.element.innerHTML = `
      <div class="bg-surface-mid p-4 rounded-lg flex flex-col w-full max-w-4xl text-white" style="max-height: 90vh;">
        <div class="flex justify-between items-center mb-3">
          <h2 class="font-montserrat font-semibold text-base uppercase">Select Mods to Download</h2>
          <div class="flex items-center gap-2">
            <span class="px-2 py-1 bg-primary-moderate rounded-full text-xs" id="selectedModsCount">0 mods selected</span>
            <span class="px-2 py-1 bg-surface-low border border-neutral-moderate rounded-full text-xs" id="selectedModsSize">0.00 MB</span>
          </div>
        </div>

        <div class="flex gap-2 mb-3">
          <input type="search" id="searchModsInput" placeholder="Search mods..." class="p-1 rounded bg-surface-low border border-neutral-moderate text-white flex-1 text-sm">
          <select id="sortModsSelect" class="p-1 rounded bg-surface-low border border-neutral-moderate text-white text-sm">
            <option value="name_asc">Mod Name (A-Z)</option>
            <option value="name_desc">Mod Name (Z-A)</option>
            <option value="size_desc">Size (Largest)</option>
            <option value="size_asc">Size (Smallest)</option>
          </select>
        </div>

        <div class="flex-1 overflow-y-auto border border-neutral-moderate/40 rounded p-2 flex flex-col gap-1 mb-3" id="modsListContainer">
        </div>

        <div class="flex justify-end gap-2">
          <button class="px-3 py-1 bg-surface-low border border-neutral-moderate rounded text-sm hover:text-white" id="cancelModalBtn">Cancel</button>
          <button class="px-3 py-1 bg-primary-moderate text-white rounded text-sm hover:bg-primary-strong font-semibold" id="confirmDownloadBtn">Download Selected</button>
        </div>
      </div>
    `;

    this.modsListContainer = this.element.querySelector('#modsListContainer') as HTMLElement;
    this.selectedCountEl = this.element.querySelector('#selectedModsCount') as HTMLElement;
    this.totalSizeEl = this.element.querySelector('#selectedModsSize') as HTMLElement;


    this.searchInput.addEventListener('input', () => this.filterAndSort());
    this.sortSelect.addEventListener('change', () => this.filterAndSort());

    this.element.querySelector('#selectAllBtn')?.addEventListener('click', () => {
      this.modsListContainer.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        (cb as HTMLInputElement).checked = true;
      });
      this.updateSelectedCount();
    });

    this.element.querySelector('#deselectAllBtn')?.addEventListener('click', () => {
      this.modsListContainer.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        (cb as HTMLInputElement).checked = false;
      });
      this.updateSelectedCount();
    });

    this.element.querySelector('#cancelModalBtn')?.addEventListener('click', () => this.close());
    this.element.querySelector('#confirmDownloadBtn')?.addEventListener('click', () => {
      const selectedIds = new Set(
        Array.from(this.modsListContainer.querySelectorAll('input[type="checkbox"]:checked')).map(
          (cb) => Number.parseInt((cb as HTMLElement).dataset.fileId || '0', 10)
        )
      );
      const selectedMods = this.mods.filter((m) => selectedIds.has(m.fileId));
      this.close();
      this.onDownloadSelected(selectedMods);
    });
  }

  private filterAndSort() {
    const q = this.searchInput.value.toLowerCase();
    let filtered = this.mods.filter(
      (m) => m.file.mod.name.toLowerCase().includes(q) || m.file.name.toLowerCase().includes(q)
    );

    const sort = this.sortSelect.value;
    if (sort === 'name_asc') filtered.sort((a, b) => a.file.mod.name.localeCompare(b.file.mod.name));
    if (sort === 'name_desc') filtered.sort((a, b) => b.file.mod.name.localeCompare(a.file.mod.name));
    if (sort === 'size_desc') filtered.sort((a, b) => b.file.size - a.file.size);
    if (sort === 'size_asc') filtered.sort((a, b) => a.file.size - b.file.size);

    this.renderModList(filtered);
  }

  private renderModList(mods: CollectionModFile[]) {
    this.modsListContainer.innerHTML = '';
    mods.forEach((mod, idx) => {
      const row = document.createElement('label');
      row.className = 'flex items-center gap-2 p-1.5 hover:bg-surface-low rounded cursor-pointer text-xs select-none border-b border-neutral-moderate/20';
      row.innerHTML = `
        <input type="checkbox" data-file-id="${mod.fileId}" class="accent-primary-moderate">
        <span class="text-neutral-moderate w-8">#${idx + 1}</span>
        <span class="font-semibold flex-1 truncate">${mod.file.mod.name}</span>
        <span class="text-neutral-moderate truncate flex-1">${mod.file.name}</span>
        <span class="w-16 text-right">${this.formatSize(mod.file.size)}</span>
        <span class="px-1.5 py-0.5 rounded text-[10px] ${mod.optional ? 'bg-surface-low border border-neutral-moderate' : 'bg-primary-moderate text-white'}">${mod.optional ? 'OPT' : 'REQ'}</span>
      `;

      row.querySelector('input')?.addEventListener('change', () => this.updateSelectedCount());
      this.modsListContainer.appendChild(row);
    });
    this.updateSelectedCount();
  }

  private updateSelectedCount() {
    const checked = this.modsListContainer.querySelectorAll('input[type="checkbox"]:checked');
    const count = checked.length;
    let totalKb = 0;
    checked.forEach((cb) => {
      const fid = Number.parseInt((cb as HTMLElement).dataset.fileId || '0', 10);
      const mod = this.mods.find((m) => m.fileId === fid);
      if (mod) totalKb += mod.file.size;
    });
    this.selectedCountEl.textContent = `${count} mods selected`;
    this.totalSizeEl.textContent = this.formatSize(totalKb);
  }


  open() {
    document.body.appendChild(this.element);
    window.addEventListener('keydown', this.handleKeyDown);
    this.element.addEventListener('click', (e) => {
      if (e.target === this.element) {
        this.close();
      }
    });
  }

  close() {
    window.removeEventListener('keydown', this.handleKeyDown);
    this.element.remove();
  }
}
