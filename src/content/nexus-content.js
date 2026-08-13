import { extractCollectionDetails } from './collection-detector.js';
import { CollectionManager } from './collection-ui.js';
import { createPageObserver } from './page-observer.js';
import { applyNoWaitFeatures, resetNoWaitState } from './no-wait.js';
import { getSettings } from '../storage/settings.js';
import { createLogger } from '../shared/logger.js';
import { STORAGE_KEY_SETTINGS } from '../shared/constants.js';
import {
  MAIN_CONTENT_SELECTORS,
  COLLECTION_PANEL_SELECTOR,
  MODAL_OVERLAY_SELECTOR,
  queryFirst,
} from './selectors.js';

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
  if (currentCollectionRoute === routeKey && document.querySelector(COLLECTION_PANEL_SELECTOR)) {
    return;
  }

  const routeChanged = currentCollectionRoute !== routeKey;
  const targetContainer = queryFirst(document, MAIN_CONTENT_SELECTORS, document.body);

  // Stop the old manager and drop its DOM before building the new panel.
  if (collectionManager) {
    if (typeof collectionManager.abort === 'function') collectionManager.abort();
    if (collectionManager.element) collectionManager.element.remove();
  }
  if (routeChanged) {
    // Route-change cleanup: stale modals and no-wait state belong to the old page.
    document.querySelectorAll(MODAL_OVERLAY_SELECTOR).forEach((el) => el.remove());
    resetNoWaitState();
  }

  currentCollectionRoute = routeKey;
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
  applyNoWaitFeatures(currentSettings);
}

async function init() {
  if (!NEXUS_HOST_REGEX.test(window.location.href)) return;

  try {
    currentSettings = await getSettings();
  } catch {
    currentSettings = { enabled: true, handleCollections: true, autoStartDownload: true, skipRequirements: true };
  }

  applyNoWaitFeatures(currentSettings);
  processCollectionPage();

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
      applyNoWaitFeatures(currentSettings);
      processCollectionPage();
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
