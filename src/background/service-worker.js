import { MESSAGE_TYPES, STORAGE_KEY_COLLECTION_HISTORY } from '../shared/constants.js';
import { dispatch, registerHandler } from './message-router.js';
import { getSettings } from '../storage/settings.js';
import { CollectionClient } from '../nexus/collection-client.js';
import { createLogger } from '../shared/logger.js';
import { LOG_LEVELS } from '../shared/constants.js';

const log = createLogger('service-worker');

let collectionClient = new CollectionClient();

async function refreshClients() {
  const settings = await getSettings();
  log.setLevel(settings.debugLogging ? LOG_LEVELS.DEBUG : LOG_LEVELS.INFO);
  collectionClient = new CollectionClient({ timeout: settings.requestTimeout });
}

self.addEventListener('install', (_event) => {
  log.info('Service worker installed');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  log.info('Service worker activated');
  event.waitUntil(self.clients.claim());
});

async function init() {
  await refreshClients();
  registerHandler(MESSAGE_TYPES.GET_SETTINGS, async () => ({
    settings: await getSettings(),
  }));
  registerHandler(MESSAGE_TYPES.SETTINGS_CHANGED, async () => {
    await refreshClients();
    return { ok: true };
  });
  registerHandler(MESSAGE_TYPES.FETCH_COLLECTION_REVISIONS, async (payload) => {
    const revisions = await collectionClient.fetchRevisions(payload.gameDomain, payload.collectionSlug);
    return { revisions };
  });
  registerHandler(MESSAGE_TYPES.FETCH_COLLECTION_MODS, async (payload) => {
    const data = await collectionClient.fetchMods(payload.gameDomain, payload.collectionSlug, payload.revision);
    return { collectionRevision: data };
  });
  registerHandler(MESSAGE_TYPES.GET_COLLECTION_HISTORY, async () => {
    const stored = await chrome.storage.local.get(STORAGE_KEY_COLLECTION_HISTORY);
    return { history: stored[STORAGE_KEY_COLLECTION_HISTORY] || {} };
  });
  registerHandler(MESSAGE_TYPES.SET_COLLECTION_HISTORY, async (payload) => {
    await chrome.storage.local.set({ [STORAGE_KEY_COLLECTION_HISTORY]: payload.history });
    return { ok: true };
  });
  registerHandler(MESSAGE_TYPES.START_DOWNLOAD, async (payload) => {
    if (!payload?.url) return { success: false, error: 'Missing download URL' };
    if (chrome.downloads && typeof chrome.downloads.download === 'function') {
      return new Promise((resolve) => {
        chrome.downloads.download({ url: payload.url, saveAs: false }, (dlId) => {
          if (chrome.runtime.lastError) {
            log.error('chrome.downloads failed', { error: chrome.runtime.lastError.message });
            resolve({ success: false, error: chrome.runtime.lastError.message });
          } else {
            log.info('chrome.downloads started', { dlId, url: payload.url });
            resolve({ success: true, downloadId: dlId });
          }
        });
      });
    }
    return { success: false, error: 'chrome.downloads API unavailable' };
  });
  registerHandler(MESSAGE_TYPES.RESOLVE_COLLECTION_DOWNLOAD, async (payload) => {
    const { fileId, gameId, gameDomain, isNMM } = payload || {};
    if (!fileId) return { url: null, error: 'Missing fileId' };

    try {
      const endpoint = 'https://www.nexusmods.com/Core/Libs/Common/Managers/Downloads?GenerateDownloadUrl';
      const body = `fid=${encodeURIComponent(fileId)}&game_id=${encodeURIComponent(gameId || '0')}${isNMM ? '&nmm=1' : ''}`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          Origin: 'https://www.nexusmods.com',
          Referer: `https://www.nexusmods.com/${gameDomain || 'stardewvalley'}/mods/1?tab=files&file_id=${fileId}`,
        },
        body,
        credentials: 'include',
      });

      const text = await response.text();
      let json = null;
      try { json = JSON.parse(text); } catch { json = null; }

      let url = json?.url || json?.URL || json?.Url || json?.data?.URI || json?.data?.url;
      if (!url && text) {
        const match = text.match(/nxm:\/\/[^\s"'<>]+/i) || text.match(/https?:\/\/[^\s"'<>]+/i);
        if (match) url = match[0];
      }

      if (url) {
        return { url: url.replace(/&amp;/g, '&'), fileId };
      }

      // If NXM requested, build fallback NXM link directly
      if (isNMM && gameDomain) {
        return { url: `nxm://${gameDomain}/mods/1/files/${fileId}`, fileId };
      }

      return { url: null, error: 'No download URL returned from Nexus' };
    } catch (e) {
      log.error('Failed to resolve collection download URL', { error: e?.message });
      return { url: null, error: e?.message || 'Network error' };
    }
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const result = dispatch(message, sender);
  if (result && typeof result.then === 'function') {
    result
      .then((response) => {
        sendResponse(response);
      })
      .catch((e) => {
        log.error('Unhandled dispatch error', { error: e?.message });
        try {
          sendResponse({ success: false, error: e?.message, code: e?.code });
        } catch (e2) {
          log.error('Failed to send error response', { error: e2?.message });
        }
      });
    return true;
  }
  return false;
});

(async () => {
  try {
    await init();
    log.info('Service worker ready');
  } catch (e) {
    log.error('Service worker init failed', { error: e?.message });
  }
})();
