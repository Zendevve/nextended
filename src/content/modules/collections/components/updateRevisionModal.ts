import { CollectionModFile, CollectionRevisionMetadata } from '../../../../common/types';
import { GraphQLClient } from '../../graphQLClient';
import { RevisionDiffer } from '../utils/revisionDiffer';

export class UpdateRevisionModalComponent {
  element: HTMLElement;
  private domainName: string;
  private collectionSlug: string;
  private currentMods: CollectionModFile[];
  private onDownloadDiff: (modsToDownload: CollectionModFile[]) => void;

  private currentSelect!: HTMLSelectElement;
  private targetSelect!: HTMLSelectElement;
  private diffContainer!: HTMLElement;
  private downloadBtn!: HTMLButtonElement;
  private revisions: CollectionRevisionMetadata[] = [];
  private modsToDownload: CollectionModFile[] = [];

  constructor(
    domainName: string,
    collectionSlug: string,
    currentMods: CollectionModFile[],
    onDownloadDiff: (modsToDownload: CollectionModFile[]) => void
  ) {
    this.domainName = domainName;
    this.collectionSlug = collectionSlug;
    this.currentMods = currentMods;
    this.onDownloadDiff = onDownloadDiff;

    this.element = document.createElement('div');
    this.element.className = 'nextended-modal fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4';
    this.renderInitialHTML();
  }

  private renderInitialHTML() {
    this.element.innerHTML = `
      <div class="bg-surface-mid p-4 rounded-lg flex flex-col w-full max-w-3xl text-white" style="max-height: 90vh;">
        <h2 class="font-montserrat font-semibold text-base uppercase mb-3">Update Collection Revision</h2>
        
        <div class="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label class="block text-xs uppercase font-semibold mb-1 text-neutral-moderate">Current Revision</label>
            <select id="currRevSelect" class="w-full p-1.5 rounded bg-surface-low border border-neutral-moderate text-white text-sm">
              <option value="">Loading revisions...</option>
            </select>
          </div>
          <div>
            <label class="block text-xs uppercase font-semibold mb-1 text-neutral-moderate">Target Revision</label>
            <select id="targetRevSelect" class="w-full p-1.5 rounded bg-surface-low border border-neutral-moderate text-white text-sm">
              <option value="">Loading revisions...</option>
            </select>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto border border-neutral-moderate/40 rounded p-3 mb-3 text-xs" id="diffContainer" style="min-height: 120px;">
          <div class="text-neutral-moderate text-center py-4">Select revisions above to compare changes.</div>
        </div>

        <div class="flex justify-end gap-2">
          <button class="px-3 py-1 bg-surface-low border border-neutral-moderate rounded text-sm hover:text-white" id="cancelUpdateBtn">Cancel</button>
          <button class="px-3 py-1 bg-primary-moderate text-white rounded text-sm hover:bg-primary-strong font-semibold" id="confirmUpdateBtn" disabled>Download Updates</button>
        </div>
      </div>
    `;

    this.currentSelect = this.element.querySelector('#currRevSelect') as HTMLSelectElement;
    this.targetSelect = this.element.querySelector('#targetRevSelect') as HTMLSelectElement;
    this.diffContainer = this.element.querySelector('#diffContainer') as HTMLElement;
    this.downloadBtn = this.element.querySelector('#confirmUpdateBtn') as HTMLButtonElement;

    this.element.querySelector('#cancelUpdateBtn')?.addEventListener('click', () => this.close());
    this.downloadBtn.addEventListener('click', () => {
      this.close();
      this.onDownloadDiff(this.modsToDownload);
    });

    this.currentSelect.addEventListener('change', () => this.calculateDiff());
    this.targetSelect.addEventListener('change', () => this.calculateDiff());
  }

  async init() {
    this.revisions = (await GraphQLClient.fetchCollectionRevisions(this.domainName, this.collectionSlug)) || [];
    this.currentSelect.innerHTML = '<option value="">Select current revision</option>';
    this.targetSelect.innerHTML = '<option value="">Select target revision</option>';

    this.revisions.forEach((rev) => {
      const opt = `<option value="${rev.revisionNumber}">Rev ${rev.revisionNumber} (${(rev.totalSize / 1048576).toFixed(1)} MB - ${rev.modCount} mods)</option>`;
      this.currentSelect.insertAdjacentHTML('beforeend', opt);
      this.targetSelect.insertAdjacentHTML('beforeend', opt);
    });
  }

  private async calculateDiff() {
    const currNum = Number.parseInt(this.currentSelect.value, 10);
    const targetNum = Number.parseInt(this.targetSelect.value, 10);

    if (!currNum || !targetNum) {
      this.downloadBtn.disabled = true;
      return;
    }

    this.diffContainer.innerHTML = '<div class="text-center py-4">Fetching revisions and comparing...</div>';

    const [currData, targetData] = await Promise.all([
      GraphQLClient.fetchCollectionMods(this.collectionSlug, currNum),
      GraphQLClient.fetchCollectionMods(this.collectionSlug, targetNum)
    ]);

    const currMods = currData?.modFiles || this.currentMods;
    const targetMods = targetData?.modFiles || [];

    const diff = RevisionDiffer.diff(currMods, targetMods);
    this.modsToDownload = [...diff.added, ...diff.updated];

    this.diffContainer.innerHTML = `
      <div class="grid grid-cols-3 gap-3">
        <div>
          <h3 class="font-semibold text-green-500 uppercase mb-1">Added (${diff.added.length})</h3>
          <div class="flex flex-col gap-1 max-h-48 overflow-y-auto">
            ${diff.added.map((m) => `<div class="truncate text-[11px]" title="${m.file.mod.name}">+ ${m.file.mod.name}</div>`).join('') || '<span class="text-neutral-moderate">None</span>'}
          </div>
        </div>
        <div>
          <h3 class="font-semibold text-sky-400 uppercase mb-1">Updated (${diff.updated.length})</h3>
          <div class="flex flex-col gap-1 max-h-48 overflow-y-auto">
            ${diff.updated.map((m) => `<div class="truncate text-[11px]" title="${m.file.mod.name}">~ ${m.file.mod.name}</div>`).join('') || '<span class="text-neutral-moderate">None</span>'}
          </div>
        </div>
        <div>
          <h3 class="font-semibold text-red-400 uppercase mb-1">Removed (${diff.removed.length})</h3>
          <div class="flex flex-col gap-1 max-h-48 overflow-y-auto">
            ${diff.removed.map((m) => `<div class="truncate text-[11px]" title="${m.file.mod.name}">- ${m.file.mod.name}</div>`).join('') || '<span class="text-neutral-moderate">None</span>'}
          </div>
        </div>
      </div>
    `;

    this.downloadBtn.disabled = this.modsToDownload.length === 0;
  }

  async open() {
    document.body.appendChild(this.element);
    await this.init();
  }

  close() {
    this.element.remove();
  }
}
