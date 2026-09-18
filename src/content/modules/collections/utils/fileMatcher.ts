import { CollectionModFile } from '../../../common/types';

export class FileMatcher {
  static matchFiles(uploadedFiles: FileList | File[], modFiles: CollectionModFile[]): {
    matchedMods: CollectionModFile[];
    unmatchedFileNames: string[];
  } {
    const fileNames = Array.from(uploadedFiles, (file) => file.name);
    // Small inputs (popup/options-scale lists): plain two-pass scan avoids index
    // build cost. Large collection scans use the indexed path below.
    if (fileNames.length < 64) {
      const nameSet = new Set(fileNames);
      const matchedMods = modFiles.filter((mod) => {
        const uri = mod.file.uri;
        if (nameSet.has(uri)) return true;
        for (const name of fileNames) {
          if (name.includes(uri)) return true;
        }
        return false;
      });
      const matchedUris = new Set(matchedMods.map((mod) => mod.file.uri));
      const unmatchedFileNames: string[] = [];
      for (const name of fileNames) {
        if (matchedUris.has(name)) continue;
        let matched = false;
        for (const uri of matchedUris) {
          if (name.includes(uri)) {
            matched = true;
            break;
          }
        }
        if (!matched) unmatchedFileNames.push(name);
      }
      return { matchedMods, unmatchedFileNames };
    }
    const matchedFlags = new Array<boolean>(fileNames.length).fill(false);
    const joinedNames = `\n${fileNames.join('\n')}\n`;
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
      // One scan of the joined haystack rejects absent URIs; only probe hits
      // pay for the per-name confirm pass (boundary-safe flag collection).
      if (!joinedNames.includes(uri)) return false;
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
