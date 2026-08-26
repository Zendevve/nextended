import { ClickInterceptor } from './interceptors/clickInterceptor';
import { RequirementsBypass } from './interceptors/requirementsBypass';
import { ArchiveInjector } from './modules/archiveInjector';
import { CollectionEngine } from './modules/collections/collectionEngine';
import { SingleDownloader } from './modules/singleDownloader';
import { StorageManager } from '../common/storage';
import { Logger } from '../common/logger';

let activeCollectionEngine: CollectionEngine | null = null;
let lastRoute = '';

function extractCollectionRouteDetails(pathname: string) {
  // Pattern: /<gameDomain>/collections/<slug> or /<gameDomain>/collections/<slug>/revisions/<rev>
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length >= 3 && parts[1] === 'collections') {
    return {
      gameDomain: parts[0],
      collectionSlug: parts[2],
      revisionNumber: parts.length >= 5 && parts[3] === 'revisions' ? Number.parseInt(parts[4], 10) : null
    };
  }
  return null;
}

async function handleRoute() {
  const currentPath = location.pathname;
  if (currentPath === lastRoute) return;
  lastRoute = currentPath;

  Logger.debug('Route changed to:', currentPath);

  // Check if collection page
  const collectionInfo = extractCollectionRouteDetails(currentPath);
  if (collectionInfo) {
    if (activeCollectionEngine) {
      activeCollectionEngine.element.remove();
      activeCollectionEngine = null;
    }

    activeCollectionEngine = new CollectionEngine(
      collectionInfo.gameDomain,
      collectionInfo.collectionSlug,
      collectionInfo.revisionNumber
    );

    await activeCollectionEngine.init();

    // Look for mounting containers
    const container =
      document.querySelector('#mainContent > div > div.relative > div.next-container') ||
      document.querySelector('.collection-header') ||
      document.querySelector('#section');

    if (container) {
      container.append(activeCollectionEngine.element);
    } else {
      document.body.prepend(activeCollectionEngine.element);
    }
  }

  // Check for auto-start single download URL
  const config = await StorageManager.getConfig();
  if (config.autoStartDownload && location.search.includes('file_id=')) {
    const params = new URLSearchParams(location.search);
    const fileId = params.get('file_id');
    const isNMM = ClickInterceptor.isNMMDownload(null, location.search);
    if (fileId) {
      setTimeout(() => {
        SingleDownloader.startDownloadFlow({
          fileId,
          isNMM,
          href: location.href,
          isAutoStart: true
        });
      }, 300);
    }
  }

  // Check archive injection
  await ArchiveInjector.inject();
}

function init() {
  Logger.info('Content script initialized');

  ClickInterceptor.attach();
  RequirementsBypass.attach();

  // Route & DOM Observers
  let timer: NodeJS.Timeout | null = null;
  const observer = new MutationObserver(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      handleRoute();
      ArchiveInjector.inject();
    }, 150);
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // History pushState hooking
  const origPush = history.pushState;
  const origReplace = history.replaceState;
  history.pushState = function (...args) {
    origPush.apply(this, args);
    handleRoute();
  };
  history.replaceState = function (...args) {
    origReplace.apply(this, args);
    handleRoute();
  };
  window.addEventListener('popstate', () => handleRoute());

  handleRoute();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
