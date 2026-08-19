import { extractCollectionDetails } from './collection-detector.js';
import { CollectionManager } from './collection-ui.js';
import { createPageObserver } from './page-observer.js';
import { applyNoWaitFeatures, resetNoWaitState, triggerDownload } from './no-wait.js';
import { FloatingDrawer } from './floating-drawer.js';
import { RequirementsBundler } from './requirements-bundler.js';
import { SearchCardActions } from './search-card-actions.js';
import { ArchiveInspector } from './archive-inspector.js';
import { InventoryAnnotator } from './inventory-sync.js';
import { CompatibilityRadar } from './compatibility-radar.js';
import { getSettings } from '../storage/settings.js';
import { createLogger } from '../shared/logger.js';
import { MESSAGE_TYPES, STORAGE_KEY_SETTINGS } from '../shared/constants.js';
import {
  MAIN_CONTENT_SELECTORS,
  COLLECTION_PANEL_SELECTOR,
  MODAL_OVERLAY_SELECTOR,
  queryFirst,
} from './selectors.js';

const log = createLogger('content');

const NEXUS_HOST_REGEX = /^https:\/\/(?:www\.)?nexusmods\.com\//i;

const floatingDrawer = new FloatingDrawer();
const requirementsBundler = new RequirementsBundler();
const searchCardActions = new SearchCardActions();
const archiveInspector = new ArchiveInspector();
const inventoryAnnotator = new InventoryAnnotator();
const compatibilityRadar = new CompatibilityRadar();
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
  } else if (message && message.type === 'NXDT_TRIGGER_NXM' && message.url) {
    triggerDownload(message.url);
    sendResponse({ ok: true });
  } else if (message && message.type === MESSAGE_TYPES.TOGGLE_DRAWER) {
    floatingDrawer.toggle();
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

  if (currentSettings.enableRequirementsBundler) {
    requirementsBundler.injectBundleButton();
  }
  if (currentSettings.enableSearchCardButtons) {
    searchCardActions.processCards();
  }
  if (currentSettings.enableArchiveInspector) {
    archiveInspector.processFiles();
  }
  inventoryAnnotator.run().catch(() => {});
  compatibilityRadar.renderRadar().catch(() => {});
}

async function init() {
  if (!NEXUS_HOST_REGEX.test(window.location.href)) return;

  try {
    currentSettings = await getSettings();
  } catch {
    currentSettings = {
      enabled: true,
      handleCollections: true,
      autoStartDownload: true,
      skipRequirements: true,
      enableRequirementsBundler: true,
      enableSearchCardButtons: true,
      enableArchiveInspector: true,
    };
  }

  floatingDrawer.init();
  processInPageFeatures();
  processCollectionPage();

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

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[STORAGE_KEY_SETTINGS]) {
      currentSettings = {
        ...currentSettings,
        ...changes[STORAGE_KEY_SETTINGS].newValue,
      };
      processInPageFeatures();
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
