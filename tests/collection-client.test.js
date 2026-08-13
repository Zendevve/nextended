import { describe, it, expect, vi } from 'vitest';
import { CollectionClient } from '../src/nexus/collection-client.js';

describe('CollectionClient', () => {
  it('fetchRevisions returns revisions list on successful GraphQL response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          collection: {
            revisions: [
              { revisionNumber: 1, totalSize: 1048576 },
              { revisionNumber: 2, totalSize: 2097152 },
            ],
          },
        },
      }),
    });

    const client = new CollectionClient({ fetchImpl: mockFetch });
    const revisions = await client.fetchRevisions('skyrimspecialedition', 'mycollection');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(revisions).toHaveLength(2);
    expect(revisions[0].revisionNumber).toBe(1);
  });

  it('fetchMods normalizes mod file URLs correctly', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          collectionRevision: {
            modFiles: [
              {
                fileId: 100,
                optional: false,
                file: {
                  fileId: 100,
                  name: 'Test Mod File',
                  size: 500,
                  mod: {
                    modId: 50,
                    name: 'Test Mod',
                    game: { domainName: 'skyrimspecialedition', id: 1704 },
                  },
                },
              },
            ],
          },
        },
      }),
    });

    const client = new CollectionClient({ fetchImpl: mockFetch });
    const res = await client.fetchMods('skyrimspecialedition', 'mycollection', 1);

    expect(res).not.toBeNull();
    expect(res.modFiles).toHaveLength(1);
    expect(res.modFiles[0].file.url).toBe(
      'https://www.nexusmods.com/skyrimspecialedition/mods/50?tab=files&file_id=100'
    );
  });

  it('handles GraphQL error responses cleanly', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        errors: [{ message: 'Collection not found' }],
      }),
    });

    const client = new CollectionClient({ fetchImpl: mockFetch });
    await expect(client.fetchRevisions('skyrim', 'invalid')).rejects.toThrow('Collection not found');
  });
});
