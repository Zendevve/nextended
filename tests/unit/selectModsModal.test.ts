import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SelectModsModalComponent,
  SelectionDocument
} from '../../src/content/modules/collections/components/selectModsModal';
import { CollectionModFile } from '../../src/common/types';

const GAME_DOMAIN = 'skyrim';
const COLLECTION_SLUG = 'test-collection';

const makeMod = (fileId: number, fileName: string, modName: string, sizeKb: number, optional: boolean): CollectionModFile => ({
  fileId,
  optional,
  file: {
    fileId,
    name: fileName,
    uri: fileName.toLowerCase().replace(/[^a-z0-9.]+/g, '-'),
    size: sizeKb,
    version: '1.2',
    date: 1700000000000,
    mod: {
      modId: fileId + 500,
      name: modName,
      version: '1.0',
      adult: false,
      game: { id: 1, domainName: GAME_DOMAIN }
    }
  }
});

const MODS: CollectionModFile[] = [
  makeMod(1001, 'Sword Pack.esp', 'Sword Pack', 2048, false),
  makeMod(1002, 'Extra Cloaks.esp', 'Extra Cloaks', 512, true),
  makeMod(1003, 'Bugfix Compilation.esp', 'Bugfix Compilation', 4096, false)
];

const makeModal = (): SelectModsModalComponent => {
  const modal = new SelectModsModalComponent(MODS, vi.fn());
  modal.open();
  return modal;
};

const checkbox = (modal: SelectModsModalComponent, fileId: number): HTMLInputElement => {
  const cb = modal.element.querySelector<HTMLInputElement>(`input[data-file-id="${fileId}"]`);
  expect(cb, `checkbox for file ${fileId}`).not.toBeNull();
  return cb!;
};

const statusOf = (modal: SelectModsModalComponent): HTMLElement =>
  modal.element.querySelector<HTMLElement>('#selectionStatus')!;

const countText = (modal: SelectModsModalComponent): string =>
  modal.element.querySelector<HTMLElement>('#selectedModsCount')!.textContent || '';

const clickButton = (modal: SelectModsModalComponent, selector: string): void => {
  modal.element.querySelector<HTMLButtonElement>(selector)!.click();
};

/** Stub the browser download plumbing so tests can read the exported blob and anchor. */
function captureExportDownload(): { anchors: HTMLAnchorElement[]; blobs: Blob[] } {
  const anchors: HTMLAnchorElement[] = [];
  const blobs: Blob[] = [];
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob: Blob | MediaSource) => {
    blobs.push(blob as Blob);
    return 'blob:mock-url';
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    anchors.push(this);
  });
  return { anchors, blobs };
}

/** Click "Import Selection", then feed `json` to the file picker it opened and run it. */
async function importJson(modal: SelectModsModalComponent, json: string): Promise<void> {
  const createdInputs: HTMLInputElement[] = [];
  const realCreateElement = document.createElement.bind(document);
  const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation(
    (tagName: string, options?: ElementCreationOptions) => {
      const el = realCreateElement(tagName, options);
      if (String(tagName).toLowerCase() === 'input') createdInputs.push(el as HTMLInputElement);
      return el;
    }
  );

  clickButton(modal, '#importSelectionBtn');
  createElementSpy.mockRestore();

  const picker = createdInputs[0];
  expect(picker, 'import opens a file picker').toBeDefined();
  expect(picker.type).toBe('file');
  expect(picker.accept).toBe('.json,application/json');

  const file = new File([json], 'selection.json', { type: 'application/json' });
  Object.defineProperty(picker, 'files', { value: [file], configurable: true });
  // The async change handler always ends in showStatus(), so the status element
  // mutating is the real completion signal — no wall-clock timer needed.
  // (Executor form: tsconfig's ES2022 lib predates Promise.withResolvers typings.)
  const status = statusOf(modal);
  let observer: MutationObserver | undefined;
  const settled = new Promise<void>((resolve) => {
    observer = new MutationObserver(() => resolve());
    observer.observe(status, { childList: true, characterData: true, subtree: true });
  });
  picker.dispatchEvent(new Event('change'));
  await settled;
  observer?.disconnect();
}

describe('SelectModsModalComponent', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.history.pushState({}, '', `/${GAME_DOMAIN}/collections/${COLLECTION_SLUG}`);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders every collection file as a checkbox row when opened', () => {
    const modal = makeModal();

    expect(document.body.contains(modal.element)).toBe(true);
    const boxes = modal.element.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    expect(boxes.length).toBe(MODS.length);
    expect(countText(modal)).toBe('0 mods selected');
  });

  it('closes on Escape or a backdrop click', () => {
    const backdropModal = makeModal();
    backdropModal.element.click();
    expect(document.body.contains(backdropModal.element)).toBe(false);

    const escapeModal = makeModal();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.body.contains(escapeModal.element)).toBe(false);
  });

  describe('export selection', () => {
    it('downloads JSON describing exactly the checked files', async () => {
      const modal = makeModal();
      checkbox(modal, 1001).checked = true;
      checkbox(modal, 1003).checked = true;

      const { anchors, blobs } = captureExportDownload();
      clickButton(modal, '#exportSelectionBtn');

      expect(blobs.length).toBe(1);
      expect(anchors.length).toBe(1);
      expect(blobs[0].type).toBe('application/json');

      const doc: SelectionDocument = JSON.parse(await blobs[0].text());
      expect(doc.version).toBe(1);
      expect(doc.gameDomain).toBe(GAME_DOMAIN);
      expect(doc.collectionSlug).toBe(COLLECTION_SLUG);
      expect(doc.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(doc.files.map((f) => f.fileId)).toEqual([1001, 1003]);
      expect(doc.files[0]).toMatchObject({
        modId: 1501,
        modName: 'Sword Pack',
        fileName: 'Sword Pack.esp',
        sizeKb: 2048,
        optional: false
      });
      expect(doc.files[1]).toMatchObject({ modName: 'Bugfix Compilation', sizeKb: 4096, optional: false });

      expect(statusOf(modal).textContent).toContain('Exported 2 selected files');
    });

    it('names the download after game domain, collection slug, and timestamp', () => {
      const modal = makeModal();
      checkbox(modal, 1002).checked = true;

      const { anchors } = captureExportDownload();
      clickButton(modal, '#exportSelectionBtn');

      expect(anchors[0].download).toMatch(
        new RegExp(
          `^nextended-selection_${GAME_DOMAIN}_${COLLECTION_SLUG}_\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}\\.json$`
        )
      );
    });
  });

  describe('import selection', () => {
    it('round-trips a selection from export into a fresh modal', async () => {
      const source = makeModal();
      checkbox(source, 1001).checked = true;
      checkbox(source, 1002).checked = true;

      const { blobs } = captureExportDownload();
      clickButton(source, '#exportSelectionBtn');
      const exportedJson = await blobs[0].text();

      const target = makeModal();
      checkbox(target, 1003).checked = true; // stale pre-selection is replaced, not merged
      await importJson(target, exportedJson);

      expect(checkbox(target, 1001).checked).toBe(true);
      expect(checkbox(target, 1002).checked).toBe(true);
      expect(checkbox(target, 1003).checked).toBe(false);
      expect(countText(target)).toBe('2 mods selected');
    });

    it('checks only matching entries and ignores ones not in the current collection', async () => {
      const modal = makeModal();
      const foreignDocument = {
        version: 1,
        gameDomain: GAME_DOMAIN,
        collectionSlug: 'some-other-collection',
        exportedAt: '2026-09-21T00:00:00.000Z',
        files: [
          {
            fileId: 1003,
            modId: 1503,
            modName: 'Bugfix Compilation',
            fileName: 'Bugfix Compilation.esp',
            sizeKb: 4096,
            optional: false
          },
          {
            fileId: 9999,
            modId: 9499,
            modName: 'Not In This Collection',
            fileName: 'not-here.esp',
            sizeKb: 1,
            optional: true
          },
          { modName: 'Entry without a numeric fileId' }
        ]
      };

      await importJson(modal, JSON.stringify(foreignDocument));

      expect(checkbox(modal, 1001).checked).toBe(false);
      expect(checkbox(modal, 1002).checked).toBe(false);
      expect(checkbox(modal, 1003).checked).toBe(true);
      expect(countText(modal)).toBe('1 mods selected');

      const status = statusOf(modal);
      expect(status.classList.contains('hidden')).toBe(false);
      expect(status.textContent).toContain('1 file checked');
      expect(status.textContent).toContain('ignored');
    });

    it('shows a visible error for malformed JSON instead of throwing', async () => {
      const modal = makeModal();
      checkbox(modal, 1001).checked = true;

      await importJson(modal, 'definitely not json {{{');

      const status = statusOf(modal);
      expect(status.classList.contains('hidden')).toBe(false);
      expect(status.classList.contains('text-red-400')).toBe(true);
      expect(status.textContent).toContain('Import failed');
      // The in-progress selection is left untouched.
      expect(checkbox(modal, 1001).checked).toBe(true);
      expect(checkbox(modal, 1002).checked).toBe(false);
    });

    it('shows a visible error for JSON that is not a selection document', async () => {
      const modal = makeModal();

      await importJson(modal, JSON.stringify({ hello: 'world' }));
      expect(statusOf(modal).textContent).toContain('Import failed');
      expect(statusOf(modal).classList.contains('hidden')).toBe(false);

      await importJson(modal, '"just a json string"');
      expect(statusOf(modal).textContent).toContain('Import failed');
    });
  });
});
