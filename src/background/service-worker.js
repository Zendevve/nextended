import { MESSAGE_TYPES } from '../shared/constants.js';
import { dispatch, registerHandler } from './message-router.js';
import { createOrchestrator } from './download-manager.js';
import { getSettings } from '../storage/settings.js';
import { createLogger } from '../shared/logger.js';
import { LOG_LEVELS } from '../shared/constants.js';

const log = createLogger('service-worker');

let orchestrator = createOrchestrator();

async function refreshOrchestrator() {
  const settings = await getSettings();
  log.setLevel(settings.debugLogging ? LOG_LEVELS.DEBUG : LOG_LEVELS.INFO);
  orchestrator = createOrchestrator({ requestTimeout: settings.requestTimeout });
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
  await refreshOrchestrator();
  registerHandler(MESSAGE_TYPES.RESOLVE_DOWNLOAD, (payload) =>
    orchestrator.start(payload)
  );
  registerHandler(MESSAGE_TYPES.GET_SETTINGS, async () => ({
    settings: await getSettings(),
  }));
  registerHandler(MESSAGE_TYPES.SETTINGS_CHANGED, async (_payload) => {
    await refreshOrchestrator();
    return { ok: true };
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const async = dispatch(message, sender);
  if (async && typeof async.then === 'function') {
    async
      .then((response) => {
        if (!sender || !sender.tab) {
          sendResponse(response);
        }
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
