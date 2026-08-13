import { extractCollectionDetails } from './collection-detector.js';
import { CollectionManager } from './collection-ui.js';
import { createPageObserver } from './page-observer.js';
import {
  autoStartDownload,
  setupSlowDownloadIntercept,
  interceptRequirements,
  archivedFileHandler,
  forceModManagerHandler,
} from './no-wait.js';
import { getSettings } from '../storage/settings.js';
import { MESSAGE_TYPES } from '../shared/constants.js';
import { createLogger } from '../shared/logger.js';
import { STORAGE_KEY_SETTINGS } from '../shared/constants.js';

const log = createLogger('content');

const NEXUS_HOST_REGEX = /^https:\/\/(?:www\.)?nexusmods\.com\//i;

let collectionManager = null;
let currentCollectionRoute = null;
let observer = null;
let currentSettings = null;

function processCollectionPage() {
  if (!currentSettings) return;
  if (!currentSettings.enabled || currentSettings.handleCollections === false) return;

  const details = extractCollectionDetails(window.location.pathname);
  if (!details) return;

  const routeKey = `${details.gameDomain}/${details.collectionSlug}/${details.revisionNumber || 'latest'}`;
  if (currentCollectionRoute === routeKey && document.querySelector('[data-nxdt-collection]')) {
    return;
  }

  const targetContainer =
    document.querySelector('#mainContent > div > div.relative > div.next-container') ||
    document.querySelector('#mainContent') ||
    document.querySelector('.collection-header') ||
    document.querySelector('.collection-view') ||
    document.querySelector('main') ||
    document.querySelector('#content') ||
    document.body;

  currentCollectionRoute = routeKey;
  if (collectionManager && collectionManager.element) {
    collectionManager.element.remove();
  }

  collectionManager = new CollectionManager(
    details.gameDomain,
    details.collectionSlug,
    details.revisionNumber
  );
  targetContainer.appendChild(collectionManager.element);
  collectionManager.init();
  log.info('Initialized collection panel', details);
}

function processNoWaitFeatures() {
  if (!currentSettings || currentSettings.enabled === false) return;
  autoStartDownload(currentSettings);
  setupSlowDownloadIntercept(currentSettings);
  archivedFileHandler(currentSettings);
  forceModManagerHandler(currentSettings);
}

async function init() {
  if (!NEXUS_HOST_REGEX.test(window.location.href)) return;

  try {
    currentSettings = await getSettings();
  } catch {
    currentSettings = { enabled: true, handleCollections: true, autoStartDownload: true, skipRequirements: true };
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

  interceptRequirements(currentSettings);
  processCollectionPage();
  processNoWaitFeatures();

  observer = createPageObserver(() => {
    processCollectionPage();
    processNoWaitFeatures();
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
      currentSettings = {
        ...currentSettings,
        ...changes[STORAGE_KEY_SETTINGS].newValue,
      };
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
