import { ClickInterceptor } from './interceptors/clickInterceptor';
import { RequirementsBypass } from './interceptors/requirementsBypass';
import { ArchiveInjector } from './modules/archiveInjector';
import { CollectionEngine } from './modules/collections/collectionEngine';
import { SingleDownloader } from './modules/singleDownloader';
import { StorageManager } from '../common/storage';
import { Logger } from '../common/logger';

let activeCollectionEngine: CollectionEngine | null = null;
let lastRoute = '';
let routeCheckTimer: number | undefined;

export function extractCollectionRouteDetails(pathname: string) {
  // Pattern matches:
  // /stardewvalley/collections/bbubvs
  // /games/stardewvalley/collections/bbubvs
  // /stardewvalley/collections/bbubvs/revisions/112
  // /stardewvalley/collections/bbubvs/mods
  const regex = /^(?:\/games)?\/([^/]+)\/collections\/([^/?#]+)(?:\/revisions\/(\d+))?/i;
  const match = pathname.match(regex);
  if (match) {
    const gameDomain = match[1];
    const collectionSlug = match[2];
    const revisionNumber = match[3] ? Number.parseInt(match[3], 10) : null;
    return { gameDomain, collectionSlug, revisionNumber };
  }
  return null;
}

function findCollectionMountTarget(): { element: Element; position: 'append' | 'after' | 'before' } | null {
  // 1. Right hero action card (next to / below "Add collection" button or revision card)
  const allButtons = Array.from(document.querySelectorAll('button, a'));
  const addCollectionBtn = allButtons.find((el) =>
    el.textContent?.trim().toLowerCase().includes('add collection')
  );
  if (addCollectionBtn) {
    const card =
      addCollectionBtn.closest('div[class*="rounded"], div[class*="bg-"], div[class*="card"], div.relative') ||
      addCollectionBtn.parentElement;
    if (card) {
      return { element: card, position: 'after' };
    }
  }

  // 2. Above Media section or tab navigation
  const headings = Array.from(document.querySelectorAll('h2, h3'));
  const mediaHeading = headings.find((el) =>
    el.textContent?.trim().toLowerCase().includes('media')
  );
  if (mediaHeading) {
    const mediaSection = mediaHeading.closest('section, div[class*="container"], div.space-y') || mediaHeading;
    return { element: mediaSection, position: 'before' };
  }

  const tabList = document.querySelector('[role="tablist"], nav.tabs, .tab-nav, .collection-header');
  if (tabList) {
    return { element: tabList, position: 'before' };
  }

  // 3. Main Next.js or legacy page layout container
  const mainContainer = document.querySelector(
    '#mainContent > div > div.relative > div.next-container, main, #mainContent, #section, #content, #__next > div'
  );
  if (mainContainer) {
    return { element: mainContainer, position: 'append' };
  }

  return null;
}

function runAfterHydration(callback: () => void | Promise<void>) {
  const run = () => {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(() => {
        void callback();
      }, { timeout: 1000 });
    } else {
      setTimeout(() => {
        void callback();
      }, 300);
    }
  };

  if (document.readyState === 'complete') {
    run();
  } else {
    window.addEventListener('load', run, { once: true });
    setTimeout(run, 1000);
  }
}

async function handleRoute() {
  const currentPath = location.pathname;
  const routeChanged = currentPath !== lastRoute;
  if (routeChanged) {
    lastRoute = currentPath;
    Logger.debug('Route changed to:', currentPath);
  }

  // Check if collection page
  const collectionInfo = extractCollectionRouteDetails(currentPath);
  if (collectionInfo) {
    const existingElement = document.getElementById('nextended-collection-container');
    if (!existingElement) {
      const target = findCollectionMountTarget();
      if (target) {
        if (activeCollectionEngine) {
          activeCollectionEngine.element.remove();
          activeCollectionEngine = null;
        }

        activeCollectionEngine = new CollectionEngine(
          collectionInfo.gameDomain,
          collectionInfo.collectionSlug,
          collectionInfo.revisionNumber
        );

        if (target.position === 'after') {
          target.element.insertAdjacentElement('afterend', activeCollectionEngine.element);
        } else if (target.position === 'before') {
          target.element.insertAdjacentElement('beforebegin', activeCollectionEngine.element);
        } else {
          target.element.appendChild(activeCollectionEngine.element);
        }

        await activeCollectionEngine.init();
      }
    }
  } else if (activeCollectionEngine) {
    activeCollectionEngine.element.remove();
    activeCollectionEngine = null;
  }

  // Check for auto-start single download URL
  if (routeChanged) {
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
  }

  // Check archive injection
  await ArchiveInjector.inject();
}

function scheduleRouteCheck(delay = 200) {
  clearTimeout(routeCheckTimer);
  routeCheckTimer = window.setTimeout(() => {
    runAfterHydration(() => handleRoute());
  }, delay);
}

function init() {
  Logger.info('Content script initialized');

  ClickInterceptor.attach();
  RequirementsBypass.attach();

  // Route & DOM Observers
  const observer = new MutationObserver(() => {
    scheduleRouteCheck(300);
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // History pushState / replaceState hooking
  const origPush = history.pushState;
  const origReplace = history.replaceState;

  history.pushState = function (...args) {
    origPush.apply(this, args);
    scheduleRouteCheck(150);
  };

  history.replaceState = function (...args) {
    origReplace.apply(this, args);
    scheduleRouteCheck(150);
  };

  window.addEventListener('popstate', () => {
    scheduleRouteCheck(150);
  });

  // Initial route handling
  runAfterHydration(() => handleRoute());
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
