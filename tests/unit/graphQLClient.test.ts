import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GraphQLClient } from '../../src/content/modules/graphQLClient';

describe('GraphQLClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('parses CollectionRevisionMods response correctly', async () => {
    const mockGraphQLResponse = {
      data: {
        collectionRevision: {
          externalResources: [],
          modFiles: [
            {
              fileId: 101,
              optional: false,
              file: {
                fileId: 101,
                name: 'Mod File 1',
                uri: 'Mod1.zip',
                size: 512,
                version: '1.0',
                date: 1234,
                mod: {
                  modId: 50,
                  name: 'Mod 50',
                  version: '1.0',
                  adult: false,
                  game: { domainName: 'skyrim', id: 1 }
                }
              }
            }
          ]
        }
      }
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockGraphQLResponse
    } as Response);

    const result = await GraphQLClient.fetchCollectionMods('my-collection', 1);

    expect(result).not.toBeNull();
    expect(result?.modFiles.length).toBe(1);
    expect(result?.modFiles[0].file.url).toContain('https://www.nexusmods.com/skyrim/mods/50?tab=files&file_id=101');
  });
});
