import { isNexusModPage, isArchivePage, findArchivedFiles } from './archive-detector.js';
import { ButtonManager } from './download-buttons.js';
import { createPageObserver } from './page-observer.js';
import { getSettings } from '../storage/settings.js';
import { MessageFactory, MESSAGE_TYPES } from '../shared/messages.js';
import { createLogger } from '../shared/logger.js';
import { STORAGE_KEY_SETTINGS } from '../shared/constants.js';

const log = createLogger('content');

let buttonManager = null;
let observer = null;
let currentSettings = null;

function sendMessage(message) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ success: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(response || {});
        }
      });
    } catch (e) {
      resolve({ success: false, error: String(e?.message) });
    }
  });
}

function buildOnResolve() {
  return async (file, mode) => {
    const response = await sendMessage(
      MessageFactory.resolveDownload(file.fileId, file.gameId, mode, file.gameSlug)
    );
    if (response && response.success && response.result) {
      return response.result;
    }
    const errPayload = (response && response.payload) || response || {};
    const message = errPayload.message || errPayload.error || 'Download failed';
    const code = errPayload.code || (response && response.code) || 'UNKNOWN';
    const err = new Error(message);
    err.code = code;
    throw err;
  };
}

function processArchivePage() {
  if (!currentSettings) return;
  if (!currentSettings.enabled || !currentSettings.handleArchivedFiles) return;

  const loc = window.location;
  if (!isNexusModPage(loc) || !isArchivePage(loc)) return;

  if (!buttonManager) {
    buttonManager = new ButtonManager({ onResolve: buildOnResolve() });
  }

  const files = findArchivedFiles(document, loc);
  buttonManager.setFilesContext(files);
  const injected = buttonManager.injectMany(files);
  log.info('Processing archive page', { files: files.length, injected });
  return files;
}

async function init() {
  if (!isNexusModPage(window.location)) return;

  try {
    currentSettings = await getSettings();
  } catch {
    currentSettings = { enabled: true, handleArchivedFiles: true };
  }

  if (chrome && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message) => {
      if (
        message &&
        message.type === MESSAGE_TYPES.SETTINGS_CHANGED &&
        message.payload &&
        message.payload.settings
      ) {
        currentSettings = message.payload.settings;
        log.debug('Settings updated', { enabled: currentSettings.enabled });
      }
    });
  }

  processArchivePage();

  observer = createPageObserver(() => {
    processArchivePage();
  });
  if (document.body) {
    observer.observe();
  } else if (document.documentElement) {
    const oo = new MutationObserver(() => {
      if (document.body) {
        oo.disconnect();
        observer.observe();
      }
    });
    oo.observe(document.documentElement, { childList: true, subtree: true });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[STORAGE_KEY_SETTINGS]) {
      const newSettings = {
        ...currentSettings,
        ...changes[STORAGE_KEY_SETTINGS].newValue,
      };
      currentSettings = newSettings;
      if (buttonManager && typeof buttonManager.setVisible === 'function') {
        buttonManager.setVisible(newSettings.enabled && newSettings.handleArchivedFiles);
      }
    }
  });
}

function onDomReady(fn) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn);
  } else {
    fn();
  }
}

onDomReady(init);
