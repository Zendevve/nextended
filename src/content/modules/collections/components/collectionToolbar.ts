import { CollectionModFile, DownloadMethod } from '../../../../common/types';
import { StorageManager } from '../../../../common/storage';
import { SelectModsModalComponent } from './selectModsModal';
import { UpdateRevisionModalComponent } from './updateRevisionModal';

export class CollectionToolbarComponent {
  element: HTMLElement;
  private domainName: string;
  private collectionSlug: string;
  private mods: { all: CollectionModFile[]; mandatory: CollectionModFile[]; optional: CollectionModFile[] };
  private onStartDownload: (mods: CollectionModFile[], typeKey: 'all' | 'mandatory' | 'optional') => void;

  private allBtn!: HTMLButtonElement;
  private mainCountSpan!: HTMLElement;
  private menuBtn!: HTMLButtonElement;
  private menuDropdown!: HTMLElement;
  private radioVortex!: HTMLInputElement;
  private radioBrowser!: HTMLInputElement;
  private importBtn!: HTMLButtonElement;

  constructor(
    domainName: string,
    collectionSlug: string,
    mods: { all: CollectionModFile[]; mandatory: CollectionModFile[]; optional: CollectionModFile[] },
    onStartDownload: (mods: CollectionModFile[], typeKey: 'all' | 'mandatory' | 'optional') => void
  ) {
    this.domainName = domainName;
    this.collectionSlug = collectionSlug;
    this.mods = mods;
    this.onStartDownload = onStartDownload;

    this.element = document.createElement('div');
    this.element.className = 'ndc-toolbar flex flex-col gap-3 w-full';
    this.renderInitialHTML();
  }

  private renderInitialHTML() {
    this.element.innerHTML = `
      <div class="flex flex-col sm:flex-row gap-3 justify-between items-center text-xs text-white">
        <div class="flex gap-4 items-center">
          <label class="flex items-center gap-1.5 cursor-pointer">
            <input type="radio" name="ndcDownloadMethod" value="0" class="accent-primary-moderate" id="radioVortex">
            <span>Send to Vortex (NXM)</span>
          </label>
          <label class="flex items-center gap-1.5 cursor-pointer">
            <input type="radio" name="ndcDownloadMethod" value="1" class="accent-primary-moderate" id="radioBrowser">
            <span>Download via Browser</span>
          </label>
        </div>
        <div>
          <button id="importDownloadedBtn" class="px-2.5 py-1.5 bg-surface-mid border border-neutral-moderate rounded text-xs hover:text-white uppercase font-semibold">
            Import Local Mod Files
          </button>
        </div>
      </div>

      <div class="flex w-full relative">
        <button class="w-full font-montserrat font-semibold text-sm uppercase flex justify-between items-center px-3 py-2 cursor-pointer bg-primary-moderate text-white hover:bg-primary-subdued rounded-l" id="mainDownloadBtn">
          <span>Download All Mods</span>
          <span class="px-2 py-0.5 bg-surface-low rounded-full text-xs" id="mainModsCount">${this.mods.all.length} mods</span>
        </button>
        <div class="relative">
          <button class="font-montserrat font-semibold text-sm uppercase px-3 py-2 cursor-pointer bg-primary-moderate text-white hover:bg-primary-subdued rounded-r border-l border-primary-strong flex items-center justify-center h-full" id="moreOptionsBtn">
            ▼
          </button>
          <div class="absolute top-full right-0 mt-1 z-20 min-w-56 bg-surface-low border border-stroke-subdued rounded shadow-lg hidden flex flex-col py-1 text-xs text-white" id="moreOptionsMenu">
            <button class="px-3 py-2 text-left hover:bg-surface-mid flex justify-between items-center" id="btnMandatory">
              <span>Mandatory Only</span>
              <span class="px-1.5 py-0.5 bg-primary-moderate rounded text-[10px]">${this.mods.mandatory.length}</span>
            </button>
            <button class="px-3 py-2 text-left hover:bg-surface-mid flex justify-between items-center" id="btnOptional">
              <span>Optional Only</span>
              <span class="px-1.5 py-0.5 bg-primary-moderate rounded text-[10px]">${this.mods.optional.length}</span>
            </button>
            <button class="px-3 py-2 text-left hover:bg-surface-mid" id="btnSelectModal">
              Select Specific Mods...
            </button>
            <button class="px-3 py-2 text-left hover:bg-surface-mid" id="btnUpdateDiffModal">
              Update Collection Revision...
            </button>
          </div>
        </div>
      </div>
    `;

    this.allBtn = this.element.querySelector('#mainDownloadBtn') as HTMLButtonElement;
    this.mainCountSpan = this.element.querySelector('#mainModsCount') as HTMLElement;
    this.menuBtn = this.element.querySelector('#moreOptionsBtn') as HTMLButtonElement;
    this.menuDropdown = this.element.querySelector('#moreOptionsMenu') as HTMLElement;
    this.radioVortex = this.element.querySelector('#radioVortex') as HTMLInputElement;
    this.radioBrowser = this.element.querySelector('#radioBrowser') as HTMLInputElement;
    this.importBtn = this.element.querySelector('#importDownloadedBtn') as HTMLButtonElement;

    this.bindEvents();
  }

  private async bindEvents() {
    const config = await StorageManager.getConfig();
    if (config.downloadMethod === DownloadMethod.BROWSER) {
      this.radioBrowser.checked = true;
    } else {
      this.radioVortex.checked = true;
    }

    this.radioVortex.addEventListener('change', async () => {
      await StorageManager.setConfig({ downloadMethod: DownloadMethod.VORTEX });
    });
    this.radioBrowser.addEventListener('change', async () => {
      await StorageManager.setConfig({ downloadMethod: DownloadMethod.BROWSER });
    });

    this.menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.menuDropdown.classList.toggle('hidden');
    });

    document.addEventListener('click', () => {
      this.menuDropdown.classList.add('hidden');
    });

    this.allBtn.addEventListener('click', () => {
      this.onStartDownload(this.mods.all, 'all');
    });

    this.element.querySelector('#btnMandatory')?.addEventListener('click', () => {
      this.menuDropdown.classList.add('hidden');
      this.onStartDownload(this.mods.mandatory, 'mandatory');
    });

    this.element.querySelector('#btnOptional')?.addEventListener('click', () => {
      this.menuDropdown.classList.add('hidden');
      this.onStartDownload(this.mods.optional, 'optional');
    });

    this.element.querySelector('#btnSelectModal')?.addEventListener('click', () => {
      this.menuDropdown.classList.add('hidden');
      const modal = new SelectModsModalComponent(this.mods.all, (selected) => {
        this.onStartDownload(selected, 'all');
      });
      modal.open();
    });

    this.element.querySelector('#btnUpdateDiffModal')?.addEventListener('click', () => {
      this.menuDropdown.classList.add('hidden');
      const modal = new UpdateRevisionModalComponent(
        this.domainName,
        this.collectionSlug,
        this.mods.all,
        (modsToDownload) => {
          this.onStartDownload(modsToDownload, 'all');
        }
      );
      modal.open();
    });

    this.importBtn.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.addEventListener('change', async () => {
        if (!input.files || input.files.length === 0) return;
        const uploadedFiles = Array.from(input.files);
        const matched = this.mods.all.filter((m) =>
          uploadedFiles.some((f) => f.name.includes(m.file.uri))
        );

        const history = await StorageManager.getHistory();
        history[this.domainName] ??= {};
        history[this.domainName][this.collectionSlug] ??= { all: [], mandatory: [], optional: [] };

        const matchedIds = matched.map((m) => m.fileId);
        history[this.domainName][this.collectionSlug].all = [
          ...new Set([...history[this.domainName][this.collectionSlug].all, ...matchedIds])
        ];

        await StorageManager.setHistory(history);
        alert(`[nextended] Successfully matched and marked ${matched.length} mods as downloaded.`);
      });
      input.click();
    });
  }

  updateMods(mods: { all: CollectionModFile[]; mandatory: CollectionModFile[]; optional: CollectionModFile[] }) {
    this.mods = mods;
    this.mainCountSpan.textContent = `${mods.all.length} mods`;
  }
}
