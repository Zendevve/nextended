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
  it('fetchMods handles string revision and omits revision variable when null or undefined', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          collectionRevision: {
            modFiles: [],
          },
        },
      }),
    });

    const client = new CollectionClient({ fetchImpl: mockFetch });

    // String revision "2" -> passes numeric revision 2 in GraphQL variables
    await client.fetchMods('skyrimspecialedition', 'mycollection', '2');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const body1 = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body1.variables).toEqual({
      slug: 'mycollection',
      viewAdultContent: true,
      revision: 2,
    });

    // null revision -> omits revision variable
    await client.fetchMods('skyrimspecialedition', 'mycollection', null);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const body2 = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(body2.variables).toEqual({
      slug: 'mycollection',
      viewAdultContent: true,
    });
    expect('revision' in body2.variables).toBe(false);

    // undefined revision -> omits revision variable
    await client.fetchMods('skyrimspecialedition', 'mycollection', undefined);
    expect(mockFetch).toHaveBeenCalledTimes(3);
    const body3 = JSON.parse(mockFetch.mock.calls[2][1].body);
    expect(body3.variables).toEqual({
      slug: 'mycollection',
      viewAdultContent: true,
    });
    expect('revision' in body3.variables).toBe(false);
  });
});
