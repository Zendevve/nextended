import { describe, it, expect } from 'vitest';
import { FileMatcher } from '../../src/content/modules/collections/utils/fileMatcher';
import { CollectionModFile } from '../../src/common/types';

describe('FileMatcher', () => {
  const mockMods: CollectionModFile[] = [
    {
      fileId: 101,
      optional: false,
      file: {
        fileId: 101,
        name: 'Cool Mod',
        uri: 'Cool_Mod-101-1-0.zip',
        size: 2048,
        version: '1.0',
        date: 12345,
        mod: { modId: 1, name: 'Cool Mod', version: '1.0', adult: false, game: { id: 1, domainName: 'skyrim' } }
      }
    },
    {
      fileId: 102,
      optional: true,
      file: {
        fileId: 102,
        name: 'Extra Textures',
        uri: 'Extra_Textures-102-2-0.zip',
        size: 4096,
        version: '2.0',
        date: 12346,
        mod: { modId: 2, name: 'Textures', version: '2.0', adult: false, game: { id: 1, domainName: 'skyrim' } }
      }
    }
  ];

  it('matches local files against collection mod URIs', () => {
    const fakeFiles = [
      new File([''], 'Cool_Mod-101-1-0.zip'),
      new File([''], 'random_unrelated_file.txt')
    ];

    const result = FileMatcher.matchFiles(fakeFiles, mockMods);
    expect(result.matchedMods.length).toBe(1);
    expect(result.matchedMods[0].fileId).toBe(101);
    expect(result.unmatchedFileNames).toEqual(['random_unrelated_file.txt']);
  });
});
