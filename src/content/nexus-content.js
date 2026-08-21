import { extractCollectionDetails } from './collection-detector.js';
import { CollectionManager } from './collection-ui.js';
import { createPageObserver } from './page-observer.js';
import { applyNoWaitFeatures, resetNoWaitState, triggerDownload } from './no-wait.js';
import { createLogger } from '../shared/logger.js';
import { MESSAGE_TYPES } from '../shared/constants.js';
import { DEFAULT_SETTINGS } from '../storage/defaults.js';
import {
  MAIN_CONTENT_SELECTORS,
  COLLECTION_PANEL_SELECTOR,
  MODAL_OVERLAY_SELECTOR,
  queryFirst,
} from './selectors.js';

const log = createLogger('content');

const NEXUS_HOST_REGEX = /^https:\/\/(?:www\.)?nexusmods\.com\//i;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === MESSAGE_TYPES.FOCUS_COLLECTION_PANEL) {
    const panel = document.querySelector(COLLECTION_PANEL_SELECTOR);
    if (panel) {
      panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
      panel.classList.add('nxdt-panel-focus');
      setTimeout(() => {
        panel.classList.remove('nxdt-panel-focus');
      }, 1600);
      sendResponse({ ok: true });
    } else {
      sendResponse({ ok: false });
    }
  } else if (message && message.type === 'NXDT_TRIGGER_NXM' && typeof message.url === 'string' && message.url.startsWith('nxm://')) {
    triggerDownload(message.url);
    sendResponse({ ok: true });
  }
  return false;
});

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

  if (collectionManager) {
    if (typeof collectionManager.abort === 'function') collectionManager.abort();
    if (collectionManager.element) collectionManager.element.remove();
  }
  if (routeChanged) {
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

function processInPageFeatures() {
  if (!currentSettings || currentSettings.enabled === false) return;
  applyNoWaitFeatures(currentSettings);
}
async function init() {
  if (!NEXUS_HOST_REGEX.test(window.location.href)) return;

  currentSettings = DEFAULT_SETTINGS;

  processInPageFeatures();
  processCollectionPage();

  const onUrlChange = () => {
    processCollectionPage();
    processInPageFeatures();
  };

  window.addEventListener('popstate', onUrlChange);
  const originalPush = history.pushState;
  const originalReplace = history.replaceState;
  history.pushState = function (...args) {
    originalPush.apply(this, args);
    onUrlChange();
  };
  history.replaceState = function (...args) {
    originalReplace.apply(this, args);
    onUrlChange();
  };

  observer = createPageObserver(() => {
    processCollectionPage();
    processInPageFeatures();
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
}

function onDomReady(fn) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn);
  } else {
    fn();
  }
}

onDomReady(init);
