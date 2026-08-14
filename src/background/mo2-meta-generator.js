import { createLogger } from '../shared/logger.js';

const log = createLogger('mo2-meta');

export function generateMo2MetaContent(item) {
  const gameName = item?.gameDomain || '';
  const modId = item?.modId || '0';
  const fileId = item?.fileId || '0';
  const version = item?.fileVersion || '1.0.0';
  const modName = item?.modName || '';

  return `[General]
gameName=${gameName}
modID=${modId}
fileID=${fileId}
version=${version}
newestVersion=${version}
category=0
repository=Nexus
modName=${modName}
installed=false
`;
}

export function createMo2MetaBlobUrl(item) {
  const content = generateMo2MetaContent(item);
  const base64 = typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(content))) : '';
  return `data:text/plain;charset=utf-8;base64,${base64}`;
}

export async function downloadMo2MetaFile(item, filename, chromeDownloads) {
  if (!chromeDownloads || typeof chromeDownloads.download !== 'function') return null;
  const metaUrl = createMo2MetaBlobUrl(item);
  const metaFilename = `${filename}.meta`;

  return new Promise((resolve) => {
    chromeDownloads.download(
      {
        url: metaUrl,
        filename: metaFilename,
        saveAs: false,
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          log.warn('Failed to generate MO2 .meta file', { error: chrome.runtime.lastError.message });
          resolve(null);
        } else {
          log.info('Generated MO2 .meta file', { downloadId, metaFilename });
          resolve(downloadId);
        }
      }
    );
  });
}
