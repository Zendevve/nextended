import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as handlers from '../../src/background/handlers.js';
import { ERROR_CODES } from '../../src/shared/errors.js';

function makeChromeMock() {
  const store = {};
  const chromeMock = {
    runtime: {
      lastError: null,
    },
    storage: {
      local: {
        get: vi.fn(async (keys) => {
          const out = {};
          if (typeof keys === 'string') {
            out[keys] = store[keys];
          } else if (Array.isArray(keys)) {
            for (const k of keys) out[k] = store[k];
          } else {
            Object.assign(out, store);
          }
          return out;
        }),
        set: vi.fn(async (items) => {
          Object.assign(store, items);
        }),
        remove: vi.fn(async (keys) => {
          delete store[keys];
        }),
      },
    },
    downloads: {
      download: vi.fn(),
    },
  };
  return { chromeMock, store };
}

function jsonResponse(status, body) {
  return {
    status,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

describe('background handlers', () => {
  let chromeMock;
  let store;

  beforeEach(() => {
    const mocks = makeChromeMock();
    chromeMock = mocks.chromeMock;
    store = mocks.store;
    globalThis.chrome = chromeMock;
    handlers.resetHistoryCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('isTrustedSender', () => {
    it('accepts nexusmods pages and own extension pages', () => {
      expect(
        handlers.isTrustedSender(
          { id: 'ext', url: 'https://www.nexusmods.com/skyrimspecialedition/mods/42' },
          'ext'
        )
      ).toBe(true);
      expect(
        handlers.isTrustedSender({ id: 'ext', url: 'chrome-extension://ext/popup.html' }, 'ext')
      ).toBe(true);
    });

    it('rejects wrong extension id and off-list pages', () => {
      expect(
        handlers.isTrustedSender({ id: 'other', url: 'https://www.nexusmods.com/' }, 'ext')
      ).toBe(false);
      expect(
        handlers.isTrustedSender({ id: 'ext', url: 'https://evil.example.com/' }, 'ext')
      ).toBe(false);
      expect(handlers.isTrustedSender({ id: 'ext' }, 'ext')).toBe(false);
      expect(handlers.isTrustedSender(null, 'ext')).toBe(false);
    });
  });

  describe('START_DOWNLOAD', () => {
    it('rejects a missing url', async () => {
      const res = await handlers.startDownload({});
      expect(res).toMatchObject({ success: false, code: ERROR_CODES.INVALID_INPUT });
      expect(chromeMock.downloads.download).not.toHaveBeenCalled();
    });

    it('rejects an off-list https url with INVALID_URL', async () => {
      const res = await handlers.startDownload({ url: 'https://evil.example/file.zip' });
      expect(res).toMatchObject({ success: false, code: ERROR_CODES.INVALID_URL });
      expect(chromeMock.downloads.download).not.toHaveBeenCalled();
    });

    it('rejects nxm:// links (chrome.downloads cannot handle them)', async () => {
      const res = await handlers.startDownload({ url: 'nxm://skyrim/mods/1/files/2' });
      expect(res).toMatchObject({ success: false, code: ERROR_CODES.INVALID_URL });
      expect(chromeMock.downloads.download).not.toHaveBeenCalled();
    });

    it('accepts an allow-listed URL, increments autoDownloadsCompleted, and never logs the full URL', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const url = 'https://files.nexus-cdn.com/12345/file.rar?token=SECRETTOKEN';
      chromeMock.downloads.download.mockImplementation((_options, cb) => cb(77));

      const res = await handlers.startDownload({ url });

      expect(res).toEqual({ success: true, downloadId: 77 });
      expect(chromeMock.downloads.download).toHaveBeenCalledWith(
        { url, saveAs: false },
        expect.any(Function)
      );
      expect(store.stats.autoDownloadsCompleted).toBe(1);

      const logged = [...logSpy.mock.calls, ...errSpy.mock.calls].flat().map(String);
      expect(logged.some((line) => line.includes(url))).toBe(false);
      expect(logged.some((line) => line.includes('files.nexus-cdn.com'))).toBe(true);
    });

    it('reports chrome.downloads lastError failures', async () => {
      chromeMock.downloads.download.mockImplementation((_options, cb) => {
        chromeMock.runtime.lastError = { message: 'download failed' };
        cb(undefined);
      });
      const res = await handlers.startDownload({ url: 'https://files.nexus-cdn.com/x.zip' });
      expect(res).toMatchObject({ success: false, error: 'download failed' });
      expect(res.code).toBe(ERROR_CODES.UNKNOWN);
      expect(store.stats?.autoDownloadsCompleted).toBeUndefined();
    });
  });

  describe('RESOLVE_ARCHIVED_DOWNLOAD', () => {
    it('builds the correct GET endpoint and returns the validated URL', async () => {
      const fetchMock = vi.fn(async (url, options) => {
        expect(url).toBe(
          'https://www.nexusmods.com/skyrimspecialedition/Core/Downloads/GenerateDownloadUrl?file_id=123456&nmm=1'
        );
        expect(options.method).toBe('GET');
        expect(options.headers['X-Requested-With']).toBe('XMLHttpRequest');
        expect(options.credentials).toBe('include');
        return jsonResponse(200, { url: 'https://files.nexus-cdn.com/abc/file.rar' });
      });
      vi.stubGlobal('fetch', fetchMock);

      const res = await handlers.resolveArchivedDownload({
        fileId: '123456',
        slug: 'skyrimspecialedition',
        isNMM: true,
      });
      expect(res).toEqual({ url: 'https://files.nexus-cdn.com/abc/file.rar', fileId: '123456' });
    });

    it('omits nmm=1 for non-NMM requests', async () => {
      const fetchMock = vi.fn(async (url) => {
        expect(url).toBe(
          'https://www.nexusmods.com/stardewvalley/Core/Downloads/GenerateDownloadUrl?file_id=9'
        );
        return jsonResponse(200, { url: 'https://files.nexus-cdn.com/abc/file.rar' });
      });
      vi.stubGlobal('fetch', fetchMock);
      await handlers.resolveArchivedDownload({ fileId: '9', slug: 'stardewvalley', isNMM: false });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('classifies 404 as FILE_NOT_FOUND', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(404, 'not found')));
      const res = await handlers.resolveArchivedDownload({ fileId: '1', slug: 's' });
      expect(res).toMatchObject({ url: null, code: ERROR_CODES.FILE_NOT_FOUND });
    });

    it('classifies 403 as AUTH_ERROR', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(403, 'login required')));
      const res = await handlers.resolveArchivedDownload({ fileId: '1', slug: 's' });
      expect(res).toMatchObject({ url: null, code: ERROR_CODES.AUTH_ERROR });
    });

    it('classifies a cloudflare challenge body as CLOUDFLARE', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          jsonResponse(200, '<html>Checking your browser... cf-chl challenge</html>')
        )
      );
      const res = await handlers.resolveArchivedDownload({ fileId: '1', slug: 's' });
      expect(res).toMatchObject({ url: null, code: ERROR_CODES.CLOUDFLARE });
    });

    it('classifies a 404 with a cloudflare body as FILE_NOT_FOUND, not CLOUDFLARE', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => jsonResponse(404, '<html>cf-ray: deadbeef not found</html>'))
      );
      const res = await handlers.resolveArchivedDownload({ fileId: '1', slug: 's' });
      expect(res).toMatchObject({ url: null, code: ERROR_CODES.FILE_NOT_FOUND });
    });

    it('accepts an extracted nxm:// URL', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => jsonResponse(200, { url: 'nxm://stardewvalley/mods/42/files/123' }))
      );
      const res = await handlers.resolveArchivedDownload({ fileId: '123', slug: 'stardewvalley' });
      expect(res).toEqual({ url: 'nxm://stardewvalley/mods/42/files/123', fileId: '123' });
    });

    it('rejects an nxm:// URL with no host as INVALID_URL', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { url: 'nxm:///foo' })));
      const res = await handlers.resolveArchivedDownload({ fileId: '123', slug: 's' });
      expect(res).toMatchObject({ url: null, code: ERROR_CODES.INVALID_URL });
    });

    it('accepts an nxm:// URL with a host', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => jsonResponse(200, { url: 'nxm://stardewvalley/mods/1/files/2' }))
      );
      const res = await handlers.resolveArchivedDownload({ fileId: '123', slug: 's' });
      expect(res).toEqual({ url: 'nxm://stardewvalley/mods/1/files/2', fileId: '123' });
    });

    it('accepts a nexus-cdn.com https URL from regex text fallback', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          jsonResponse(200, 'Download: <a href="https://files.nexus-cdn.com/x/y.zip">here</a>')
        )
      );
      const res = await handlers.resolveArchivedDownload({ fileId: '123', slug: 's' });
      expect(res.url).toBe('https://files.nexus-cdn.com/x/y.zip');
    });

    it('rejects an off-list extracted https URL with INVALID_URL', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => jsonResponse(200, { url: 'https://evil.example/file.zip' }))
      );
      const res = await handlers.resolveArchivedDownload({ fileId: '123', slug: 's' });
      expect(res).toMatchObject({ url: null, code: ERROR_CODES.INVALID_URL });
    });

    it('returns INVALID_RESPONSE when the body has no usable URL', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { success: false })));
      const res = await handlers.resolveArchivedDownload({ fileId: '123', slug: 's' });
      expect(res).toMatchObject({ url: null, code: ERROR_CODES.INVALID_RESPONSE });
    });

    it('returns TIMEOUT when the request is aborted', async () => {
      store.settings = { requestTimeout: 30 };
      vi.stubGlobal(
        'fetch',
        vi.fn(
          (_url, options) =>
            new Promise((_resolve, reject) => {
              options.signal.addEventListener('abort', () => {
                const e = new Error('Aborted');
                e.name = 'AbortError';
                reject(e);
              });
            })
        )
      );
      const res = await handlers.resolveArchivedDownload({ fileId: '123', slug: 's' });
      expect(res).toMatchObject({ url: null, code: ERROR_CODES.TIMEOUT });
    });

    it('rejects missing input', async () => {
      const res = await handlers.resolveArchivedDownload({ fileId: '1' });
      expect(res).toMatchObject({ url: null, code: ERROR_CODES.INVALID_INPUT });
    });
  });

  describe('RESOLVE_COLLECTION_DOWNLOAD', () => {
    it('posts fid/game_id/nmm and returns the validated URL', async () => {
      const fetchMock = vi.fn(async (url, options) => {
        expect(url).toContain('GenerateDownloadUrl');
        expect(options.method).toBe('POST');
        expect(options.body).toContain('fid=123');
        expect(options.body).toContain('game_id=1704');
        expect(options.body).toContain('nmm=1');
        expect(options.credentials).toBe('include');
        return jsonResponse(200, { url: 'https://files.nexus-cdn.com/abc/file.rar' });
      });
      vi.stubGlobal('fetch', fetchMock);

      const res = await handlers.resolveCollectionDownload({
        fileId: '123',
        gameId: '1704',
        gameDomain: 'skyrimspecialedition',
        isNMM: true,
      });
      expect(res).toEqual({ url: 'https://files.nexus-cdn.com/abc/file.rar', fileId: '123' });
    });

    it('builds the NMM fallback from payload.modId, never /mods/1/', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => jsonResponse(200, { success: false, error: 'no url' }))
      );
      const res = await handlers.resolveCollectionDownload({
        fileId: '123',
        gameId: '1704',
        gameDomain: 'stardewvalley',
        isNMM: true,
        modId: '42',
      });
      expect(res.url).toBe('nxm://stardewvalley/mods/42/files/123');
      expect(res.url).not.toContain('/mods/1/');
    });

    it('returns INVALID_URL for NMM requests without modId', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { success: false })));
      const res = await handlers.resolveCollectionDownload({
        fileId: '123',
        gameDomain: 'stardewvalley',
        isNMM: true,
      });
      expect(res).toMatchObject({ url: null, code: ERROR_CODES.INVALID_URL });
    });

    it('rejects an off-list extracted URL with INVALID_URL', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => jsonResponse(200, { url: 'https://evil.example/file.zip' }))
      );
      const res = await handlers.resolveCollectionDownload({ fileId: '123', isNMM: false });
      expect(res).toMatchObject({ url: null, code: ERROR_CODES.INVALID_URL });
    });

    it('classifies 403 as AUTH_ERROR', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(403, 'forbidden')));
      const res = await handlers.resolveCollectionDownload({ fileId: '123', isNMM: false });
      expect(res).toMatchObject({ url: null, code: ERROR_CODES.AUTH_ERROR });
    });
  });

  describe('collection history', () => {
    it('merges new fileIds into the stored shape without clobbering existing entries', async () => {
      store.collection_history = { g1: { c1: { all: ['1'] } } };
      const res = await handlers.setCollectionHistory({
        gameDomain: 'g1',
        collectionSlug: 'c1',
        type: 'all',
        fileIds: ['2', '3'],
      });
      expect(res).toEqual({ ok: true });

      await handlers.setCollectionHistory({
        gameDomain: 'g1',
        collectionSlug: 'c1',
        type: 'optional',
        fileIds: ['4'],
      });

      const hist = await handlers.getCollectionHistory();
      expect(hist.history).toEqual({ g1: { c1: { all: ['1', '2', '3'], optional: ['4'] } } });
      expect(store.collection_history).toEqual({
        g1: { c1: { all: ['1', '2', '3'], optional: ['4'] } },
      });
    });

    it('dedupes repeated fileIds', async () => {
      await handlers.setCollectionHistory({
        gameDomain: 'g1',
        collectionSlug: 'c1',
        type: 'all',
        fileIds: ['1', '1', '2'],
      });
      const hist = await handlers.getCollectionHistory();
      expect(hist.history.g1.c1.all).toEqual(['1', '2']);
    });

    it('keeps concurrent updates without losing writes', async () => {
      await Promise.all([
        handlers.setCollectionHistory({
          gameDomain: 'g',
          collectionSlug: 'c',
          type: 'all',
          fileIds: ['a'],
        }),
        handlers.setCollectionHistory({
          gameDomain: 'g',
          collectionSlug: 'c',
          type: 'all',
          fileIds: ['b'],
        }),
      ]);
      const hist = await handlers.getCollectionHistory();
      expect(hist.history.g.c.all).toEqual(['a', 'b']);
    });

    it('rejects invalid payloads', async () => {
      const res = await handlers.setCollectionHistory({ gameDomain: 'g' });
      expect(res).toMatchObject({ ok: false, code: ERROR_CODES.INVALID_INPUT });
    });

    it('replace mode overwrites the stored list instead of merging', async () => {
      store.collection_history = { g1: { c1: { all: ['1', '2'] } } };
      await handlers.setCollectionHistory({
        gameDomain: 'g1',
        collectionSlug: 'c1',
        type: 'all',
        fileIds: ['3', '4'],
        replace: true,
      });
      const hist = await handlers.getCollectionHistory();
      expect(hist.history.g1.c1.all).toEqual(['3', '4']);
      expect(store.collection_history.g1.c1.all).toEqual(['3', '4']);
    });

    it('replace mode with empty fileIds clears the list', async () => {
      store.collection_history = { g1: { c1: { all: ['1', '2'] } } };
      await handlers.setCollectionHistory({
        gameDomain: 'g1',
        collectionSlug: 'c1',
        type: 'all',
        fileIds: [],
        replace: true,
      });
      const hist = await handlers.getCollectionHistory();
      expect(hist.history.g1.c1.all).toEqual([]);
    });

    it('rejects a non-boolean replace flag', async () => {
      const res = await handlers.setCollectionHistory({
        gameDomain: 'g1',
        collectionSlug: 'c1',
        type: 'all',
        fileIds: ['1'],
        replace: 'yes',
      });
      expect(res).toMatchObject({ ok: false, code: ERROR_CODES.INVALID_INPUT });
    });

    it('rejects __proto__ keys and never pollutes Object.prototype', async () => {
      const propsBefore = Object.getOwnPropertyNames(Object.prototype);
      const res = await handlers.setCollectionHistory({
        gameDomain: '__proto__',
        collectionSlug: 'c1',
        type: 'all',
        fileIds: ['1'],
      });
      expect(res).toMatchObject({ ok: false, code: ERROR_CODES.INVALID_INPUT });
      expect(({}).all).toBeUndefined();
      expect(Object.getOwnPropertyNames(Object.prototype)).toEqual(propsBefore);
    });
  });

  describe('COLLECTION_FINISHED', () => {
    it('increments collectionsDownloaded and returns ok', async () => {
      const res = await handlers.collectionFinished();
      expect(res).toEqual({ ok: true });
      expect(store.stats.collectionsDownloaded).toBe(1);
    });
  });
});
