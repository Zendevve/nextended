import { DownloadResolver } from '../nexus/download-resolver.js';
import { isSafeDownloadUrl, parseUrlSafe } from '../nexus/url-utils.js';
import { ERROR_CODES, NexusDownloadError } from '../shared/errors.js';
import { MODE_MANAGER } from '../shared/constants.js';
import { createLogger } from '../shared/logger.js';
import { getSettings, incrementStat } from '../storage/settings.js';

const log = createLogger('downloads');

export class DownloadOrchestrator {
  constructor(options = {}) {
    this.ResolverCls = options.ResolverCls || DownloadResolver;
    this.downloadImpl = options.downloadImpl;
    this.openUrlImpl = options.openUrlImpl;
  }

  async start(payload) {
    const { fileId, gameId, slug, mode } = payload || {};
    const settings = await getSettings();

    if (!settings.enabled || !settings.handleArchivedFiles) {
      throw new NexusDownloadError(
        ERROR_CODES.NOT_ARCHIVED,
        'Extension disabled for archives'
      );
    }

    if (mode === MODE_MANAGER && !settings.modManagerDownloads) {
      throw new NexusDownloadError(
        ERROR_CODES.INVALID_INPUT,
        'Manager downloads disabled'
      );
    }
    if (mode === 'manual' && !settings.manualDownloads) {
      throw new NexusDownloadError(
        ERROR_CODES.INVALID_INPUT,
        'Manual downloads disabled'
      );
    }

    const resolver = new this.ResolverCls({ timeout: settings.requestTimeout });
    const resolved = await resolver.resolve(fileId, gameId, slug, mode);
    const url = resolved.url;

    if (url && /^nxm:/i.test(url)) {
      await incrementStat('downloadsStarted');
      log.info('Manager link resolved', { fileId, mode });
      return { action: 'open', url, fileId, mode };
    }

    if (!isSafeDownloadUrl(url)) {
      throw new NexusDownloadError(ERROR_CODES.INVALID_URL, 'Unsafe download URL', {
        url,
        fileId,
      });
    }

    await incrementStat('downloadsStarted');

    const filename = this._guessFilename(url);
    const dlResult = await this._initiateDownload(url, filename);
    log.info('Download initiated', { fileId, mode, url });
    return { action: 'download', url, fileId, mode, filename, downloadId: dlResult?.id };
  }

  async _initiateDownload(url, filename) {
    const impl = this.downloadImpl || defaultDownloadImpl;
    return impl(url, filename);
  }

  _guessFilename(url) {
    const u = parseUrlSafe(url);
    if (!u) return '';
    const name = u.pathname.split('/').pop() || '';
    return filenameFromQuery(u.searchParams, name);
  }
}

function filenameFromQuery(searchParams, fallback) {
  const ext = searchParams.get('ext') || searchParams.get('extension');
  if (ext) {
    const base = fallback.replace(/\.\w+$/, '') || 'nexus-file';
    return `${base}.${ext.replace(/[^a-z0-9]/i, '')}`;
  }
  return fallback || 'nexus-file';
}

async function defaultDownloadImpl(url, filename) {
  if (!chrome || !chrome.downloads) {
    return null;
  }
  try {
    return await new Promise((resolve) => {
      chrome.downloads.download({ url, filename, saveAs: false }, (res) => {
        if (chrome.runtime.lastError) {
          resolve(null);
        } else {
          resolve({ id: res });
        }
      });
    });
  } catch {
    return null;
  }
}

export function createOrchestrator(options = {}) {
  return new DownloadOrchestrator(options);
}
