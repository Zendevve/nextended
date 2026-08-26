import { describe, it, expect } from 'vitest';
import { RevisionDiffer } from '../../src/content/modules/collections/utils/revisionDiffer';
import { CollectionModFile } from '../../src/common/types';

describe('RevisionDiffer', () => {
  const createMockMod = (modId: number, fileId: number, name: string, version: string): CollectionModFile => ({
    fileId,
    optional: false,
    file: {
      fileId,
      name,
      uri: `file-${fileId}.zip`,
      size: 1024,
      version,
      date: 123456789,
      mod: {
        modId,
        name: `Mod ${modId}`,
        version,
        adult: false,
        game: { id: 1, domainName: 'cyberpunk2077' }
      }
    }
  });

  it('detects added, updated, and removed mods correctly', () => {
    const currentMods = [
      createMockMod(1, 101, 'Mod 1 file', '1.0.0'),
      createMockMod(2, 201, 'Mod 2 file', '1.0.0'),
      createMockMod(3, 301, 'Mod 3 file', '1.0.0') // will be removed
    ];

    const newMods = [
      createMockMod(1, 101, 'Mod 1 file', '1.0.0'), // unchanged
      createMockMod(2, 202, 'Mod 2 file', '2.0.0'), // updated version
      createMockMod(4, 401, 'Mod 4 file', '1.0.0') // newly added
    ];

    const diff = RevisionDiffer.diff(currentMods, newMods);

    expect(diff.added.length).toBe(1);
    expect(diff.added[0].file.mod.modId).toBe(4);

    expect(diff.updated.length).toBe(1);
    expect(diff.updated[0].file.mod.modId).toBe(2);
    expect(diff.updated[0].file.version).toBe('2.0.0');

    expect(diff.removed.length).toBe(1);
    expect(diff.removed[0].file.mod.modId).toBe(3);
  });
});
