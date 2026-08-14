import { getSettings } from '../storage/settings.js';
import { createLogger } from '../shared/logger.js';

const log = createLogger('file-organizer');

// eslint-disable-next-line no-control-regex
const ILLEGAL_CHARS_REGEX = /[<>:"/\\|?*\x00-\x1F]/g;

export function sanitizeFilenamePart(str = '') {
  return String(str)
    .replace(ILLEGAL_CHARS_REGEX, '_')
    .trim()
    .replace(/\.+$/, '');
}

export function formatDownloadPath(template, item, originalFilename) {
  if (!template || typeof template !== 'string') {
    return originalFilename;
  }

  const game = sanitizeFilenamePart(item?.gameDomain || item?.slug || 'UnknownGame');
  const modName = sanitizeFilenamePart(item?.modName || 'Mod');
  const version = sanitizeFilenamePart(item?.fileVersion || 'latest');
  const filename = sanitizeFilenamePart(originalFilename || item?.fileName || 'download.zip');

  let path = template
    .replace(/\{game\}/gi, game)
    .replace(/\{mod_name\}/gi, modName)
    .replace(/\{version\}/gi, version)
    .replace(/\{file_name\}/gi, filename);

  // Clean double slashes
  path = path.replace(/[\\/]+/g, '/').replace(/^\/+/, '');

  if (!path.endsWith(filename)) {
    path = `${path}/${filename}`;
  }

  return path.replace(/[\\/]+/g, '/');
}

export class FileOrganizer {
  constructor() {
    this.downloadMetadata = new Map();
  }

  registerDownload(downloadId, item) {
    if (downloadId && item) {
      this.downloadMetadata.set(downloadId, {
        ...item,
        registeredAt: Date.now(),
      });
    }
  }

  unregisterDownload(downloadId) {
    this.downloadMetadata.delete(downloadId);
  }

  async handleDeterminingFilename(downloadItem, suggest) {
    const meta = this.downloadMetadata.get(downloadItem.id);
    if (!meta) {
      suggest();
      return;
    }

    try {
      const settings = await getSettings();
      if (!settings.organizeDownloads) {
        suggest();
        return;
      }

      const template = settings.downloadFolderTemplate || 'NexusMods/{game}/{mod_name}';
      const targetPath = formatDownloadPath(template, meta, downloadItem.filename);
      log.info('Routing download to organized path', { from: downloadItem.filename, to: targetPath });
      suggest({ filename: targetPath, conflictAction: 'uniquify' });
    } catch (e) {
      log.warn('Error during download filename organization', { error: e?.message });
      suggest();
    }
  }
}
