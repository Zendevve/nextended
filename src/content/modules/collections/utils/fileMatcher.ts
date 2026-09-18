import { CollectionModFile } from '../../../common/types';

/** FNV-1a over a slice; numeric grams avoid per-gram string allocation. */
function hashSlice(text: string, start: number, length: number): number {
  let hash = 0x811c9dc5;
  const end = start + length;
  for (let i = start; i < end; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

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
    // Containment prefilter: if any name contains a URI, that URI's first GRAM
    // chars occur inside some name. Indexing every GRAM-gram of every name makes
    // the reject test one set lookup instead of a scan across all names.
    const GRAM = 12;
    const nameGramHashes = new Set<number>();
    for (let i = 0; i < fileNames.length; i++) {
      const name = fileNames[i];
      if (name.length <= GRAM) {
        nameGramHashes.add(hashSlice(name, 0, name.length));
        continue;
      }
      for (let s = 0; s + GRAM <= name.length; s++) nameGramHashes.add(hashSlice(name, s, GRAM));
    }
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
      // Gram-set reject: only URIs whose leading gram occurs in some name can
      // possibly be contained, so misses skip the per-name confirm pass.
      const probeLen = Math.min(GRAM, uri.length);
      if (!nameGramHashes.has(hashSlice(uri, 0, probeLen))) return false;
      const probe = uri.slice(0, probeLen);
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
        const name = fileNames[i];
        if (!name.includes(probe)) continue;
        if (name.includes(uri)) {
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
