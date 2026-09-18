import { CollectionModFile } from '../../../common/types';

export interface RevisionDiffResult {
  added: CollectionModFile[];
  updated: CollectionModFile[];
  removed: CollectionModFile[];
}

export class RevisionDiffer {
  static diff(currentMods: CollectionModFile[], newMods: CollectionModFile[]): RevisionDiffResult {
    // Group mods by modId
    const currentMap = new Map<number, CollectionModFile[]>();
    for (const mod of currentMods) {
      const arr = currentMap.get(mod.file.mod.modId) || [];
      arr.push(mod);
      currentMap.set(mod.file.mod.modId, arr);
    }

    const newMap = new Map<number, CollectionModFile[]>();
    for (const mod of newMods) {
      const arr = newMap.get(mod.file.mod.modId) || [];
      arr.push(mod);
      newMap.set(mod.file.mod.modId, arr);
    }

    const added: CollectionModFile[] = [];
    const updated: CollectionModFile[] = [];
    const removed: CollectionModFile[] = [];

    // Index both sides by fileId and by name (first occurrence wins) so each
    // file resolves in O(1) instead of scanning its modId group.
    const currentByFileId = new Map<number, CollectionModFile>();
    const currentByName = new Map<string, CollectionModFile>();
    for (const mod of currentMods) {
      if (!currentByFileId.has(mod.fileId)) currentByFileId.set(mod.fileId, mod);
      if (!currentByName.has(mod.file.name)) currentByName.set(mod.file.name, mod);
    }
    const newByFileId = new Map<number, CollectionModFile>();
    const newByName = new Map<string, CollectionModFile>();
    for (const mod of newMods) {
      if (!newByFileId.has(mod.fileId)) newByFileId.set(mod.fileId, mod);
      if (!newByName.has(mod.file.name)) newByName.set(mod.file.name, mod);
    }

    for (const newModFile of newMods) {
      const match = currentByFileId.get(newModFile.fileId) || currentByName.get(newModFile.file.name);
      if (!match) {
        added.push(newModFile);
      } else if (match.file.version !== newModFile.file.version) {
        updated.push(newModFile);
      }
    }

    for (const curModFile of currentMods) {
      const match = newByFileId.get(curModFile.fileId) || newByName.get(curModFile.file.name);
      if (!match) {
        removed.push(curModFile);
      }
    }

    return { added, updated, removed };
  }
}
