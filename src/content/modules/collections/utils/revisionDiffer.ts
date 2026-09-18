import { CollectionModFile } from '../../../common/types';

export interface RevisionDiffResult {
  added: CollectionModFile[];
  updated: CollectionModFile[];
  removed: CollectionModFile[];
}

export class RevisionDiffer {
  static diff(currentMods: CollectionModFile[], newMods: CollectionModFile[]): RevisionDiffResult {
    const added: CollectionModFile[] = [];
    const updated: CollectionModFile[] = [];
    const removed: CollectionModFile[] = [];

    // Index current by fileId and by name (first occurrence wins) so each new
    // file resolves in O(1); matched current entries land in the hit-sets and
    // unhit current entries are removed. No new-side index needed.
    const currentByFileId = new Map<number, CollectionModFile>();
    const currentByName = new Map<string, CollectionModFile>();
    for (const mod of currentMods) {
      if (!currentByFileId.has(mod.fileId)) currentByFileId.set(mod.fileId, mod);
      if (!currentByName.has(mod.file.name)) currentByName.set(mod.file.name, mod);
    }
    const hitFileIds = new Set<number>();
    const hitNames = new Set<string>();
    for (const newModFile of newMods) {
      const match =
        currentByFileId.get(newModFile.fileId) || currentByName.get(newModFile.file.name);
      if (!match) {
        added.push(newModFile);
      } else {
        hitFileIds.add(match.fileId);
        hitNames.add(match.file.name);
        if (match.file.version !== newModFile.file.version) {
          updated.push(newModFile);
        }
      }
    }

    for (const curModFile of currentMods) {
      if (!hitFileIds.has(curModFile.fileId) && !hitNames.has(curModFile.file.name)) {
        removed.push(curModFile);
      }
    }

    return { added, updated, removed };
  }
}
