import { CollectionModFile } from '../../../../common/types';
import { Logger } from '../../../../common/logger';

/** A single checked file as serialized into a selection JSON document. */
export interface SelectionFileEntry {
  fileId: number;
  modId: number;
  modName: string;
  fileName: string;
  sizeKb: number;
  optional: boolean;
}

/**
 * Document written by "Export Selection" and read back by "Import Selection".
 * Self-describing so a saved selection stays portable and inspectable.
 */
export interface SelectionDocument {
  version: number;
  gameDomain: string;
  collectionSlug: string;
  exportedAt: string;
  files: SelectionFileEntry[];
}

const SELECTION_VERSION = 1;

export class SelectModsModalComponent {
  element: HTMLElement;
  private mods: CollectionModFile[];
  private onDownloadSelected: (selected: CollectionModFile[]) => void;
  private gameDomain: string;
  private collectionSlug: string;

  private modsListContainer!: HTMLElement;
  private selectedCountEl!: HTMLElement;
  private totalSizeEl!: HTMLElement;
  private searchInput!: HTMLInputElement;
  private sortSelect!: HTMLSelectElement;
  private statusEl!: HTMLElement;

  constructor(mods: CollectionModFile[], onDownloadSelected: (selected: CollectionModFile[]) => void) {
    this.mods = mods;
    this.onDownloadSelected = onDownloadSelected;
    this.gameDomain = this.deriveGameDomain();
    this.collectionSlug = this.deriveCollectionSlug();

    this.element = document.createElement('div');
    this.element.className = 'nextended-modal fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4';
    this.renderInitialHTML();
  }

  /** Prefer the mod data; collection pages live at /{gameDomain}/collections/{slug}. */
  private deriveGameDomain(): string {
    const fromMod = this.mods[0]?.file.mod.game.domainName;
    if (fromMod) return fromMod;
    const segments = window.location.pathname.split('/').filter(Boolean);
    if (segments.length >= 3 && segments[1] === 'collections') return segments[0];
    return 'unknown-game';
  }

  private deriveCollectionSlug(): string {
    const segments = window.location.pathname.split('/').filter(Boolean);
    if (segments.length >= 3 && segments[1] === 'collections') return segments[2];
    return 'collection';
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

        <div class="flex flex-wrap items-center gap-2 mb-3">
          <button class="px-2 py-1 bg-surface-low border border-neutral-moderate rounded text-xs hover:text-white" id="selectAllBtn">Select All</button>
          <button class="px-2 py-1 bg-surface-low border border-neutral-moderate rounded text-xs hover:text-white" id="deselectAllBtn">Deselect All</button>
          <span class="flex-1"></span>
          <button class="px-2 py-1 bg-surface-low border border-neutral-moderate rounded text-xs hover:text-white" id="importSelectionBtn">Import Selection</button>
          <button class="px-2 py-1 bg-surface-low border border-neutral-moderate rounded text-xs hover:text-white" id="exportSelectionBtn">Export Selection</button>
        </div>

        <div class="flex-1 overflow-y-auto border border-neutral-moderate/40 rounded p-2 flex flex-col gap-1 mb-3" id="modsListContainer">
        </div>

        <div class="hidden text-xs mb-3" id="selectionStatus" role="status"></div>

        <div class="flex justify-end gap-2">
          <button class="px-3 py-1 bg-surface-low border border-neutral-moderate rounded text-sm hover:text-white" id="cancelModalBtn">Cancel</button>
          <button class="px-3 py-1 bg-primary-moderate text-white rounded text-sm hover:bg-primary-strong font-semibold" id="confirmDownloadBtn">Download Selected</button>
        </div>
      </div>
    `;

    this.modsListContainer = this.element.querySelector('#modsListContainer') as HTMLElement;
    this.selectedCountEl = this.element.querySelector('#selectedModsCount') as HTMLElement;
    this.totalSizeEl = this.element.querySelector('#selectedModsSize') as HTMLElement;
    this.searchInput = this.element.querySelector('#searchModsInput') as HTMLInputElement;
    this.sortSelect = this.element.querySelector('#sortModsSelect') as HTMLSelectElement;
    this.statusEl = this.element.querySelector('#selectionStatus') as HTMLElement;

    this.searchInput.addEventListener('input', () => this.filterAndSort());
    this.sortSelect.addEventListener('change', () => this.filterAndSort());

    this.element.addEventListener('click', (e) => {
      if (e.target === this.element) {
        this.close();
      }
    });

    this.element.querySelector('#selectAllBtn')?.addEventListener('click', () => {
      this.modsListContainer.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((cb) => {
        cb.checked = true;
      });
      this.updateSelectedCount();
    });

    this.element.querySelector('#deselectAllBtn')?.addEventListener('click', () => {
      this.modsListContainer.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((cb) => {
        cb.checked = false;
      });
      this.updateSelectedCount();
    });

    this.element.querySelector('#exportSelectionBtn')?.addEventListener('click', () => this.exportSelection());
    this.element.querySelector('#importSelectionBtn')?.addEventListener('click', () => this.importSelection());

    this.element.querySelector('#cancelModalBtn')?.addEventListener('click', () => this.close());
    this.element.querySelector('#confirmDownloadBtn')?.addEventListener('click', () => {
      const selectedMods = this.getSelectedMods();
      this.close();
      this.onDownloadSelected(selectedMods);
    });

    this.filterAndSort();
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

  private getSelectedMods(): CollectionModFile[] {
    const checkedIds = new Set(
      Array.from(this.modsListContainer.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked')).map(
        (cb) => Number.parseInt(cb.dataset.fileId || '0', 10)
      )
    );
    return this.mods.filter((m) => checkedIds.has(m.fileId));
  }

  private updateSelectedCount() {
    const checked = this.modsListContainer.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked');
    const count = checked.length;
    let totalKb = 0;
    checked.forEach((cb) => {
      const fid = Number.parseInt(cb.dataset.fileId || '0', 10);
      const mod = this.mods.find((m) => m.fileId === fid);
      if (mod) totalKb += mod.file.size;
    });
    this.selectedCountEl.textContent = `${count} mods selected`;
    this.totalSizeEl.textContent = this.formatSize(totalKb);
  }

  private buildExportFileName(): string {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    return `nextended-selection_${this.gameDomain}_${this.collectionSlug}_${timestamp}.json`;
  }

  private exportSelection(): void {
    const document_: SelectionDocument = {
      version: SELECTION_VERSION,
      gameDomain: this.gameDomain,
      collectionSlug: this.collectionSlug,
      exportedAt: new Date().toISOString(),
      files: this.getSelectedMods().map((m) => ({
        fileId: m.fileId,
        modId: m.file.mod.modId,
        modName: m.file.mod.name,
        fileName: m.file.name,
        sizeKb: m.file.size,
        optional: m.optional
      }))
    };

    const blob = new Blob([JSON.stringify(document_, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = this.buildExportFileName();
    anchor.click();
    URL.revokeObjectURL(url);

    const fileName = anchor.download;
    this.showStatus(`Exported ${document_.files.length} selected ${document_.files.length === 1 ? 'file' : 'files'} to ${fileName}.`, 'info');
    Logger.info(
      `Selection export: ${document_.files.length} ${document_.files.length === 1 ? 'file' : 'files'} (${this.gameDomain}/${this.collectionSlug})`
    );
  }

  private importSelection(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        this.applySelection(this.parseSelectionEntries(await file.text()));
      } catch (err) {
        this.showStatus('Import failed: the file is not a valid nextended selection export.', 'error');
        Logger.error('Selection import failed:', err);
      }
    });
    input.click();
  }

  /** Accepts any parsed JSON with a `files` array; entries without a numeric fileId are ignored. */
  private parseSelectionEntries(text: string): SelectionFileEntry[] {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('selection document is not a JSON object');
    }
    const files = (parsed as { files?: unknown }).files;
    if (!Array.isArray(files)) {
      throw new Error('selection document has no files array');
    }
    return files.filter(
      (entry): entry is SelectionFileEntry =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as { fileId?: unknown }).fileId === 'number'
    );
  }

  /** The imported selection replaces the current one; entries outside this collection are ignored. */
  private applySelection(entries: SelectionFileEntry[]): void {
    const wantedIds = new Set(entries.map((entry) => entry.fileId));
    const matchedIds = new Set(this.mods.filter((m) => wantedIds.has(m.fileId)).map((m) => m.fileId));

    this.modsListContainer
      .querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
      .forEach((cb) => {
        cb.checked = matchedIds.has(Number.parseInt(cb.dataset.fileId || '0', 10));
      });
    this.updateSelectedCount();

    const matched = matchedIds.size;
    const ignored = entries.length - matched;
    const ignoredNote =
      ignored > 0 ? ` (${ignored} ${ignored === 1 ? 'entry' : 'entries'} not in this collection ignored)` : '';
    this.showStatus(`Imported selection: ${matched} ${matched === 1 ? 'file' : 'files'} checked${ignoredNote}.`, 'info');
    Logger.info(`Selection import: ${matched}/${entries.length} entries matched (${this.gameDomain}/${this.collectionSlug})`);
  }

  private showStatus(message: string, kind: 'info' | 'error'): void {
    this.statusEl.textContent = message;
    this.statusEl.classList.remove('hidden', 'text-red-400', 'text-neutral-moderate');
    this.statusEl.classList.add(kind === 'error' ? 'text-red-400' : 'text-neutral-moderate');
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      this.close();
    }
  };

  open() {
    document.body.appendChild(this.element);
    window.addEventListener('keydown', this.handleKeyDown);
  }

  close() {
    window.removeEventListener('keydown', this.handleKeyDown);
    this.element.remove();
  }
}
