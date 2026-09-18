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

  // The indexed path engages at 64+ uploads; these cases cover the gram-based
  // containment index that path builds (the small-input path is covered above).
  describe('with 64+ uploaded files (indexed path)', () => {
    const modWithUri = (fileId: number, uri: string): CollectionModFile => ({
      fileId,
      optional: false,
      file: {
        fileId,
        name: `Mod ${fileId}`,
        uri,
        size: 1024,
        version: '1.0',
        date: 1,
        mod: { modId: fileId, name: `Mod ${fileId}`, version: '1.0', adult: false, game: { id: 1, domainName: 'skyrim' } }
      }
    });

    const withNoise = (...names: string[]): File[] => [
      ...Array.from({ length: 80 }, (_, i) => new File([''], `unrelated-noise-${i}.zip`)),
      ...names.map((n) => new File([''], n))
    ];

    it('matches a URI contained in a longer local filename', () => {
      const result = FileMatcher.matchFiles(
        withNoise('backup__Cool_Mod-202-1-0.zip.bak'),
        [modWithUri(202, 'Cool_Mod-202-1-0.zip')]
      );

      expect(result.matchedMods.map((m) => m.fileId)).toEqual([202]);
      expect(result.unmatchedFileNames).toHaveLength(80);
    });

    it('matches a URI shorter than the gram length contained in a longer filename', () => {
      const result = FileMatcher.matchFiles(withNoise('prefix-a.zip-v2-final'), [modWithUri(303, 'a.zip')]);

      expect(result.matchedMods.map((m) => m.fileId)).toEqual([303]);
      expect(result.unmatchedFileNames).toHaveLength(80);
    });

    it('keeps files lacking any matched URI and files whose URI is absent', () => {
      const result = FileMatcher.matchFiles(
        withNoise('backup__Cool_Mod-202-1-0.zip.bak'),
        [modWithUri(202, 'Cool_Mod-202-1-0.zip'), modWithUri(404, 'Missing_Mod-404-1-0.zip')]
      );

      expect(result.matchedMods.map((m) => m.fileId)).toEqual([202]);
      expect(result.unmatchedFileNames).toHaveLength(80);
    });

    it('treats every file containing a matched URI as matched when that URI also matches exactly', () => {
      const result = FileMatcher.matchFiles(
        withNoise('Cool_Mod-202-1-0.zip', 'archive__Cool_Mod-202-1-0.zip.old'),
        [modWithUri(202, 'Cool_Mod-202-1-0.zip')]
      );

      expect(result.matchedMods.map((m) => m.fileId)).toEqual([202]);
      expect(result.unmatchedFileNames).toHaveLength(80);
    });

    it('treats a file named exactly like a matched short URI as matched', () => {
      const result = FileMatcher.matchFiles(withNoise('a.zip'), [modWithUri(303, 'a.zip')]);

      expect(result.matchedMods.map((m) => m.fileId)).toEqual([303]);
      expect(result.unmatchedFileNames).toHaveLength(80);
    });

    it('treats a file named exactly like a matched gram-length URI as matched', () => {
      const result = FileMatcher.matchFiles(withNoise('TwelveChar1.zip'), [modWithUri(505, 'TwelveChar1.zip')]);

      expect(result.matchedMods.map((m) => m.fileId)).toEqual([505]);
      expect(result.unmatchedFileNames).toHaveLength(80);
    });
  });
});
