import { CollectionModFile } from '../../../common/types';

export class FileMatcher {
  static matchFiles(uploadedFiles: FileList | File[], modFiles: CollectionModFile[]): {
    matchedMods: CollectionModFile[];
    unmatchedFileNames: string[];
  } {
    const fileNames = Array.from(uploadedFiles, (file) => file.name);
    const nameSet = new Set(fileNames);

    // Exact name hits are the common case; only misses pay for a substring scan.
    const matchedMods = modFiles.filter((mod) => {
      const uri = mod.file.uri;
      if (nameSet.has(uri)) return true;
      for (const name of fileNames) {
        if (name.includes(uri)) return true;
      }
      return false;
    });

    // Unmatched = local names that contain no matched mod URI (set lookup first,
    // substring scan only for names that are not an exact URI).
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
}
