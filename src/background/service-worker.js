import { LOG_LEVELS } from '../shared/constants.js';
import { ERROR_CODES } from '../shared/errors.js';
import { dispatch } from './message-router.js';
import { registerHandlers, isTrustedSender, resolveCollectionDownload, resolveArchivedDownload, startDownload } from './handlers.js';
import { getSettings } from '../storage/settings.js';
import { CollectionClient } from '../nexus/collection-client.js';
import { QueueManager } from './queue-manager.js';
import { FileOrganizer } from './file-organizer.js';
import { createLogger } from '../shared/logger.js';

const log = createLogger('service-worker');

let collectionClient = new CollectionClient();
let fileOrganizer = new FileOrganizer();
let queueManager = null;

async function refreshClients() {
  const settings = await getSettings();
  log.setLevel(settings.debugLogging ? LOG_LEVELS.DEBUG : LOG_LEVELS.INFO);
  collectionClient = new CollectionClient({ timeout: settings.requestTimeout });
  if (queueManager) {
    queueManager.controller.updateOptions({
      maxConcurrent: settings.maxConcurrentDownloads || 2,
      retryAttempts: settings.retryAttempts ?? 3,
      backoffBaseMs: settings.retryBackoffBaseMs || 2000,
    });
  }
}

self.addEventListener('install', (_event) => {
  log.info('Service worker installed');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  log.info('Service worker activated');
  event.waitUntil(self.clients.claim());
});

async function dispatchNxmToActiveTab(nxmUrl) {
  // Query active nexus tab or any tab to trigger the iframe protocol handler
  if (typeof chrome !== 'undefined' && chrome.tabs) {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const targetTab = tabs[0];
      if (targetTab && targetTab.id) {
        // Try executing protocol navigation in the tab
        chrome.tabs.sendMessage(targetTab.id, {
          type: 'NXDT_TRIGGER_NXM',
          url: nxmUrl,
        }).catch(() => {
          /* tab may not have content script */
        });
      }
    } catch {
      /* ignore */
    }
  }
}

async function init() {
  queueManager = new QueueManager({
    resolveCollectionDownload,
    resolveArchivedDownload,
    startDownload: (payload) => startDownload(payload, { fileOrganizer }),
    dispatchNxmUrl: async (url) => dispatchNxmToActiveTab(url),
  });

  await queueManager.init();
  await refreshClients();

  registerHandlers({
    getCollectionClient: () => collectionClient,
    refreshClients,
    queueManager,
    fileOrganizer,
  });

  if (typeof chrome !== 'undefined' && chrome.downloads && chrome.downloads.onDeterminingFilename) {
    chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
      fileOrganizer.handleDeterminingFilename(item, suggest);
      return true; // asynchronous suggest
    });
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isTrustedSender(sender, chrome.runtime.id)) {
    sendResponse({ success: false, error: 'Untrusted sender', code: ERROR_CODES.INVALID_INPUT });
    return false;
  }
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
