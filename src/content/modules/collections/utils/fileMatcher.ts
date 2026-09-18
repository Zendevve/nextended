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

/**
 * Matches local files against collection mod URIs by containment:
 * a mod matches when any local filename contains its URI, and a local file is
 * unmatched when it contains no matched mod URI.
 */
export class FileMatcher {
  static matchFiles(uploadedFiles: FileList | File[], modFiles: CollectionModFile[]): {
    matchedMods: CollectionModFile[];
    unmatchedFileNames: string[];
  } {
    const fileNames = Array.from(uploadedFiles, (file) => file.name);
    // Small inputs (popup/options-scale lists): plain scan avoids index build cost.
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

    const GRAM = 12;
    // Gram index over local names: a URI contained in some name must have its
    // leading GRAM chars inside that name, so one hash lookup rejects misses
    // without scanning names. Names are indexed by their first occurrence order
    // for the length-sorted scan below.
    const nameGramHashes = new Set<number>();
    const indicesByName = new Map<string, number[]>();
    for (let i = 0; i < fileNames.length; i++) {
      const name = fileNames[i];
      const list = indicesByName.get(name);
      if (list) list.push(i);
      else indicesByName.set(name, [i]);
      // Names shorter than GRAM cannot contain a GRAM-long URI.
      if (name.length < GRAM) continue;
      for (let s = 0; s + GRAM <= name.length; s++) nameGramHashes.add(hashSlice(name, s, GRAM));
    }
    const order: number[] = new Array(fileNames.length);
    for (let i = 0; i < order.length; i++) order[i] = i;
    order.sort((a, b) => fileNames[a].length - fileNames[b].length);

    const matchedMods = modFiles.filter((mod) => {
      const uri = mod.file.uri;
      if (indicesByName.has(uri)) return true;
      // URIs shorter than GRAM are not covered by the gram index; scan directly.
      const useGram = uri.length >= GRAM;
      if (useGram && !nameGramHashes.has(hashSlice(uri, 0, GRAM))) return false;
      const probe = uri.slice(0, useGram ? GRAM : uri.length);
      // A name containing the URI must be strictly longer than it.
      let lo = 0;
      let hi = order.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (fileNames[order[mid]].length <= uri.length) lo = mid + 1;
        else hi = mid;
      }
      for (let k = lo; k < order.length; k++) {
        const name = fileNames[order[k]];
        if (useGram && !name.includes(probe)) continue;
        if (name.includes(uri)) return true;
      }
      return false;
    });

    // A local file is unmatched only when it contains no matched mod URI, so
    // index matched URIs by gram and look each name up once (no O(names x uris)
    // rescan), which keeps the original substring semantics.
    const uriGramIndex = new Map<number, string[]>();
    const shortUris: string[] = [];
    for (const mod of matchedMods) {
      const uri = mod.file.uri;
      if (uri.length < GRAM) {
        shortUris.push(uri);
        continue;
      }
      const key = hashSlice(uri, 0, GRAM);
      const list = uriGramIndex.get(key);
      if (list) list.push(uri);
      else uriGramIndex.set(key, [uri]);
    }
    const unmatchedFileNames: string[] = [];
    for (let i = 0; i < fileNames.length; i++) {
      const name = fileNames[i];
      let containsMatchedUri = false;
      // URIs at least GRAM long are reachable through any of the name's grams.
      for (let s = 0; s + GRAM <= name.length; s++) {
        const candidates = uriGramIndex.get(hashSlice(name, s, GRAM));
        if (!candidates) continue;
        for (let c = 0; c < candidates.length; c++) {
          if (name.includes(candidates[c])) {
            containsMatchedUri = true;
            break;
          }
        }
        if (containsMatchedUri) break;
      }
      // Shorter matched URIs are not covered by the gram index; test directly.
      if (!containsMatchedUri) {
        for (let c = 0; c < shortUris.length; c++) {
          if (name.includes(shortUris[c])) {
            containsMatchedUri = true;
            break;
          }
        }
      }
      if (!containsMatchedUri) unmatchedFileNames.push(name);
    }

    return { matchedMods, unmatchedFileNames };
  }
}
