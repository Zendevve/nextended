import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { DownloadManager } from '../../src/background/downloadManager';
import { StorageManager } from '../../src/common/storage';
import { DEFAULT_CONFIG } from '../../src/common/config';

const CDN_URL = 'https://file.nexus-cdn.com/1701234/skyrim/Some%20Mod.7z?Expires=1730000000&Signature=abc';
const FOREIGN_URL = 'https://example.com/files/Some%20Mod.7z';

type SuggestionCallback = (suggestion?: chrome.downloads.DownloadFilenameSuggestion) => void;
type DeterminationListener = (item: chrome.downloads.DownloadItem, suggest: SuggestionCallback) => void;

interface GlobalWithChrome {
  chrome?: {
    runtime?: Record<string, unknown>;
    downloads?: {
      download: Mock;
      onDeterminingFilename: { addListener: Mock };
    };
  };
}

function makeItem(filename: string, url = CDN_URL): chrome.downloads.DownloadItem {
  return { id: 1, url, filename } as unknown as chrome.downloads.DownloadItem;
}

interface SuggestionCapture {
  suggest: Mock;
  called: Promise<void>;
}

/** The init() listener delegates to an async handler; `called` resolves on the first suggest() so tests await the real signal. */
function captureSuggestion(): SuggestionCapture {
  let resolveCalled!: () => void;
  const called = new Promise<void>((resolve) => {
    resolveCalled = resolve;
  });
  const suggest = vi.fn(() => resolveCalled());
  return { suggest, called };
}

describe('DownloadManager filename determination', () => {
  let downloadMock: Mock;
  let listener: DeterminationListener;

  beforeEach(async () => {
    vi.restoreAllMocks();
    localStorage.clear();
    downloadMock = vi.fn();
    const addListenerMock: Mock = vi.fn();
    const globalObj = globalThis as unknown as GlobalWithChrome;
    globalObj.chrome = {
      runtime: {},
      downloads: {
        download: downloadMock,
        onDeterminingFilename: { addListener: addListenerMock }
      }
    };

    DownloadManager.init();
    listener = addListenerMock.mock.calls[0][0] as DeterminationListener;

    await StorageManager.setConfig(DEFAULT_CONFIG);
  });

  afterEach(() => {
    delete (globalThis as unknown as GlobalWithChrome).chrome;
  });

  /** Simulates Chrome: onDeterminingFilename fires while the download is being created, then the id resolves. */
  async function triggerDownloadWithDetermination(filename: string, modId?: string | number, url = CDN_URL) {
    let capture: SuggestionCapture | null = null;
    downloadMock.mockImplementation(
      (options: { url: string; filename?: string }, callback: (downloadId: number) => void) => {
        capture = captureSuggestion();
        listener(makeItem(options.filename || filename, options.url), capture.suggest);
        callback(1);
      }
    );

    const downloadId = await DownloadManager.triggerDownload(url, filename, modId);
    await (capture as unknown as SuggestionCapture).called;
    return { downloadId, suggest: (capture as unknown as SuggestionCapture).suggest };
  }

  async function determineFilename(filename: string, url = CDN_URL) {
    const { suggest, called } = captureSuggestion();
    listener(makeItem(filename, url), suggest);
    await called;
    return suggest;
  }

  describe('with overrideFileNames enabled', () => {
    beforeEach(async () => {
      await StorageManager.setConfig({ overrideFileNames: true });
    });

    it('appends the pending mod id before the extension, preserving it', async () => {
      const { suggest } = await triggerDownloadWithDetermination('Some Mod.7z', '12345');

      expect(suggest).toHaveBeenCalledTimes(1);
      expect(suggest).toHaveBeenCalledWith({ filename: 'Some Mod-12345.7z', conflictAction: 'uniquify' });
    });

    it('does not duplicate an id already present as a bounded token', async () => {
      const { suggest } = await triggerDownloadWithDetermination('Some Mod-12345.7z', 12345);

      expect(suggest).toHaveBeenCalledWith({ filename: 'Some Mod-12345.7z', conflictAction: 'uniquify' });
    });

    it('still appends an id that only appears embedded inside other tokens', async () => {
      const { suggest } = await triggerDownloadWithDetermination('Some12345Mod.7z', '12345');

      expect(suggest).toHaveBeenCalledWith({ filename: 'Some12345Mod-12345.7z', conflictAction: 'uniquify' });
    });

    it('falls back to the original suggestion when no mod id is known', async () => {
      const viaTrigger = await triggerDownloadWithDetermination('Some Mod.7z');
      expect(viaTrigger.suggest).toHaveBeenCalledWith({ filename: 'Some Mod.7z', conflictAction: 'uniquify' });

      const direct = await determineFilename('Some Mod.7z');
      expect(direct).toHaveBeenCalledWith({ filename: 'Some Mod.7z', conflictAction: 'uniquify' });
    });

    it('tags the fallback name when the item carries no filename', async () => {
      const { suggest } = await triggerDownloadWithDetermination('', '12345');

      expect(suggest).toHaveBeenCalledWith({ filename: 'nexus_download-12345', conflictAction: 'uniquify' });
    });
  });

  describe('with overrideFileNames disabled', () => {
    it('leaves the native suggestion untouched even when a mod id is pending', async () => {
      const { suggest } = await triggerDownloadWithDetermination('Some Mod.7z', '12345');

      expect(suggest).toHaveBeenCalledTimes(1);
      expect(suggest).toHaveBeenCalledWith();
    });
  });

  it('leaves non-CDN downloads untouched even when a mod id is pending', async () => {
    await StorageManager.setConfig({ overrideFileNames: true });

    const { suggest } = await triggerDownloadWithDetermination('Some Mod.7z', '12345', FOREIGN_URL);

    expect(suggest).toHaveBeenCalledTimes(1);
    expect(suggest).toHaveBeenCalledWith();
  });

  it('resolves the chrome download id from the trigger', async () => {
    const { downloadId } = await triggerDownloadWithDetermination('Some Mod.7z', '12345');

    expect(downloadId).toBe(1);
    expect(downloadMock).toHaveBeenCalledWith(
      { url: CDN_URL, filename: 'Some Mod.7z', saveAs: false },
      expect.any(Function)
    );
  });
});
