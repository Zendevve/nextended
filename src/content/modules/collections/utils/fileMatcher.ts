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

/** Lowercased name without its archive extension and any trailing upload-timestamp segment. */
function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\.[a-z0-9]{1,5}$/, '').replace(/-\d{9,}$/, '');
}

/**
 * Matches local files against collection mod URIs.
 *
 * Primary semantics are containment: a mod matches when any local filename
 * contains its URI. As a fallback for near-miss downloads (the user grabbed a
 * different revision or Nexus served a timestamped variant), a mod also
 * matches when a filename's stable core — name plus file id, with extension,
 * upload timestamp, and version suffix stripped — starts with the URI's core.
 * A local file is unmatched when it satisfies neither test for any matched mod.
 */
export class FileMatcher {
  /**
   * Stable core of a mod's URI: lowercased name and file id with the archive
   * extension, any trailing upload timestamp, and the version suffix removed.
   * Filenames for the same file id at different versions or upload dates share
   * this core, so a near-miss download still starts with it.
   */
  private static coreOf(uri: string, version?: string): string {
    let core = normalizeName(uri);
    if (version) {
      const suffix = `-${version.toLowerCase().replace(/\./g, '-')}`;
      if (core.endsWith(suffix)) core = core.slice(0, -suffix.length);
    }
    // A degenerate URI (digits-only with the version stripped) must not match
    // every filename; fall back to the unstripped normalization.
    return core.length > 0 ? core : normalizeName(uri) || uri.toLowerCase();
  }

  static matchFiles(uploadedFiles: FileList | File[], modFiles: CollectionModFile[]): {
    matchedMods: CollectionModFile[];
    unmatchedFileNames: string[];
  } {
    const fileNames = Array.from(uploadedFiles, (file) => file.name);
    const normalizedNames = fileNames.map(normalizeName);
    const cores = new Map<CollectionModFile, string>();
    for (const mod of modFiles) cores.set(mod, this.coreOf(mod.file.uri, mod.file.version));

    // Small inputs (popup/options-scale lists): plain scan avoids index build cost.
    if (fileNames.length < 64) {
      const matchedMods = modFiles.filter((mod) => {
        const uri = mod.file.uri;
        const core = cores.get(mod)!;
        for (let i = 0; i < fileNames.length; i++) {
          if (fileNames[i].includes(uri) || normalizedNames[i].startsWith(core)) return true;
        }
        return false;
      });

      const unmatchedFileNames: string[] = [];
      for (let i = 0; i < fileNames.length; i++) {
        let matched = false;
        for (const mod of matchedMods) {
          if (fileNames[i].includes(mod.file.uri) || normalizedNames[i].startsWith(cores.get(mod)!)) {
            matched = true;
            break;
          }
        }
        if (!matched) unmatchedFileNames.push(fileNames[i]);
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
      if (useGram && !nameGramHashes.has(hashSlice(uri, 0, GRAM))) {
        // Containment is impossible; only the core fallback can still match.
      } else {
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
      }
      // Near-miss fallback: version/date variants share the mod's stable core.
      const core = cores.get(mod)!;
      for (let i = 0; i < normalizedNames.length; i++) {
        if (normalizedNames[i].startsWith(core)) return true;
      }
      return false;
    });

    // A local file is unmatched only when it satisfies neither the containment
    // nor the core test against any matched mod, so index matched URIs by gram
    // and look each name up once (no O(names x uris) rescan), which keeps the
    // original substring semantics; the core check runs only for survivors.
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
      // Near-miss fallback for files whose version/date differs from the URI.
      if (!containsMatchedUri) {
        for (const mod of matchedMods) {
          if (normalizedNames[i].startsWith(cores.get(mod)!)) {
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
