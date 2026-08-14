import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyCollectionDownloads } from '../../src/background/handlers.js';
import { STORAGE_KEY_COLLECTION_HISTORY } from '../../src/shared/constants.js';

describe('verifyCollectionDownloads', () => {
  beforeEach(() => {
    globalThis.chrome = {
      storage: {
        local: {
          get: vi.fn(() =>
            Promise.resolve({
              [STORAGE_KEY_COLLECTION_HISTORY]: {
                skyrimspecialedition: {
                  'test-collection': {
                    all: ['101', '102'],
                  },
                },
              },
            })
          ),
          set: vi.fn(() => Promise.resolve()),
        },
      },
      downloads: {
        search: vi.fn((_query, cb) => {
          cb([
            { id: 1, filename: 'C:\\Downloads\\SkyUI_5_2_SE.7z', state: 'complete', bytesReceived: 1024000 },
          ]);
        }),
      },
      runtime: { lastError: null },
    };
  });

  it('correctly matches downloaded files from history and browser downloads', async () => {
    const modFiles = [
      { fileId: '101', modName: 'SkyUI', fileName: 'SkyUI_5_2_SE.7z', fileSize: 1024000 },
      { fileId: '102', modName: 'USSEP', fileName: 'USSEP.7z', fileSize: 2048000 },
      { fileId: '103', modName: 'MissingMod', fileName: 'MissingMod.7z', fileSize: 500000 },
    ];

    const report = await verifyCollectionDownloads({
      gameDomain: 'skyrimspecialedition',
      collectionSlug: 'test-collection',
      modFiles,
    });

    expect(report.total).toBe(3);
    expect(report.confirmed).toBe(2); // 101 (browser+history) and 102 (history)
    expect(report.missing).toBe(1); // 103
    expect(report.percentage).toBe(67);

    const missingItem = report.results.find((r) => r.fileId === '103');
    expect(missingItem.confirmed).toBe(false);
    expect(missingItem.state).toBe('missing');
  });
});
