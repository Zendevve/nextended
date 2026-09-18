import { CollectionModFile } from '../../../common/types';

export class FileMatcher {
  static matchFiles(uploadedFiles: FileList | File[], modFiles: CollectionModFile[]): {
    matchedMods: CollectionModFile[];
    unmatchedFileNames: string[];
  } {
    const fileNames = Array.from(uploadedFiles, (file) => file.name);
    const matchedFlags = new Array<boolean>(fileNames.length).fill(false);

    // Index local names once. Exact hits resolve via map; substring misses only
    // scan strictly-longer names (equal lengths imply equality, already checked).
    const indicesByName = new Map<string, number[]>();
    for (let i = 0; i < fileNames.length; i++) {
      const list = indicesByName.get(fileNames[i]);
      if (list) list.push(i);
      else indicesByName.set(fileNames[i], [i]);
    }
    const order = new Array<number>(fileNames.length);
    for (let i = 0; i < order.length; i++) order[i] = i;
    order.sort((a, b) => fileNames[a].length - fileNames[b].length);

    const matchedMods = modFiles.filter((mod) => {
      const uri = mod.file.uri;
      const exact = indicesByName.get(uri);
      if (exact) {
        for (const i of exact) matchedFlags[i] = true;
        return true;
      }
      let lo = 0;
      let hi = order.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (fileNames[order[mid]].length <= uri.length) lo = mid + 1;
        else hi = mid;
      }
      let hit = false;
      for (let k = lo; k < order.length; k++) {
        const i = order[k];
        if (fileNames[i].includes(uri)) {
          matchedFlags[i] = true;
          hit = true;
        }
      }
      return hit;
    });

    // A file containing any mod URI implies that mod matched, so flags recorded
    // above fully determine the unmatched set — no second scan pass needed.
    const unmatchedFileNames: string[] = [];
    for (let i = 0; i < fileNames.length; i++) {
      if (!matchedFlags[i]) unmatchedFileNames.push(fileNames[i]);
    }
    return { matchedMods, unmatchedFileNames };
  }
}
