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

    for (const [modId, newModFiles] of newMap.entries()) {
      const currentModFiles = currentMap.get(modId) || [];
      for (const newModFile of newModFiles) {
        const match = currentModFiles.find(
          (m) => m.fileId === newModFile.fileId || m.file.name === newModFile.file.name
        );
        if (!match) {
          added.push(newModFile);
        } else if (match.file.version !== newModFile.file.version) {
          updated.push(newModFile);
        }
      }
    }

    for (const [modId, currentModFiles] of currentMap.entries()) {
      const newModFiles = newMap.get(modId) || [];
      for (const curModFile of currentModFiles) {
        const match = newModFiles.find(
          (m) => m.fileId === curModFile.fileId || m.file.name === curModFile.file.name
        );
        if (!match) {
          removed.push(curModFile);
        }
      }
    }

    return { added, updated, removed };
  }
}
