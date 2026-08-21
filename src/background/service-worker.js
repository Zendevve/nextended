import { LOG_LEVELS } from '../shared/constants.js';
import { ERROR_CODES } from '../shared/errors.js';
import { dispatch } from './message-router.js';
import { registerHandlers, isTrustedSender } from './handlers.js';
import { getSettings } from '../storage/settings.js';
import { CollectionClient } from '../nexus/collection-client.js';
import { createLogger } from '../shared/logger.js';

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
  registerHandlers({ collectionClient, refreshClients });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isTrustedSender(sender, chrome.runtime?.id)) {
    log.warn('Rejected message from untrusted sender', { sender });
    sendResponse({ success: false, error: 'Unauthorized sender', code: ERROR_CODES.AUTH_ERROR });
    return false;
  }

  if (!message || typeof message !== 'object' || typeof message.type !== 'string') {
    sendResponse({ success: false, error: 'Invalid message envelope', code: ERROR_CODES.INVALID_INPUT });
    return false;
  }

  dispatch(message.type, message.payload)
    .then((result) => sendResponse({ success: true, result }))
    .catch((err) => {
      log.error('Handler error', { type: message.type, error: err?.message });
      sendResponse({
        success: false,
        error: err?.message || 'Internal handler error',
        code: err?.code || ERROR_CODES.UNKNOWN,
      });
    });

  return true;
});

(async () => {
  try {
    await init();
  } catch (err) {
    log.error('Service worker init failed', err);
  }
})();
