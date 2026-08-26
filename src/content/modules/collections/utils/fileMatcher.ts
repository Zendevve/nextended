import { CollectionModFile } from '../../../common/types';

export class FileMatcher {
  static matchFiles(uploadedFiles: FileList | File[], modFiles: CollectionModFile[]): {
    matchedMods: CollectionModFile[];
    unmatchedFileNames: string[];
  } {
    const fileList = Array.from(uploadedFiles);
    const matchedMods = modFiles.filter((mod) => {
      return fileList.some((file) => file.name.includes(mod.file.uri));
    });

    const unmatchedFileNames = fileList
      .filter((file) => !matchedMods.some((mod) => file.name.includes(mod.file.uri)))
      .map((f) => f.name);

    return { matchedMods, unmatchedFileNames };
  }
}
