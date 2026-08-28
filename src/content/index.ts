import { ClickInterceptor } from './interceptors/clickInterceptor';
import { RequirementsBypass } from './interceptors/requirementsBypass';
import { ArchiveInjector } from './modules/archiveInjector';
import { CollectionEngine } from './modules/collections/collectionEngine';
import { SingleDownloader } from './modules/singleDownloader';
import { StorageManager } from '../common/storage';
import { Logger } from '../common/logger';

let activeCollectionEngine: CollectionEngine | null = null;
let lastRoute = '';
let lastAutoStartedKey = '';
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
    return {
      gameDomain: match[1],
      collectionSlug: match[2],
      revisionNumber: match[3] ? parseInt(match[3], 10) : null
    };
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
    const parentContainer = addCollectionBtn.closest('.flex.flex-col, .card, div');
    if (parentContainer) {
      return { element: parentContainer, position: 'after' };
    }
    return { element: addCollectionBtn, position: 'after' };
  }

  // 2. Above Media section or tab navigation
  const headings = Array.from(document.querySelectorAll('h2, h3'));
  const mediaHeading = headings.find((el) =>
    el.textContent?.trim().toLowerCase().includes('media')
  );
  if (mediaHeading) {
    return { element: mediaHeading, position: 'before' };
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
  const currentSearch = location.search;
  const currentUrl = location.href;
  const currentRouteKey = `${currentPath}${currentSearch}`;
  const routeChanged = currentRouteKey !== lastRoute;

  if (routeChanged) {
    lastRoute = currentRouteKey;
    Logger.debug('Route changed to:', currentRouteKey);
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

  // Check for auto-start single download URL or countdown page
  const config = await StorageManager.getConfig();
  if (config.autoStartDownload) {
    const params = new URLSearchParams(location.search);
    const slowBtn = document.getElementById('slowDownloadButton') || document.querySelector('[data-download-url], input#dl_link');
    const hasFileParam = params.has('file_id') || params.has('id');
    const isCountdownPage = Boolean(slowBtn || document.querySelector('.countdown, #slowDownloadButton'));

    if (hasFileParam || isCountdownPage) {
      let fileId = params.get('file_id') || params.get('id') || ClickInterceptor.extractFileId(currentUrl, slowBtn as HTMLElement | null);
      const isNMM = ClickInterceptor.isNMMDownload(slowBtn as HTMLElement | null, location.search);
      const autoStartKey = `${currentRouteKey}#${fileId || ''}`;

      if (autoStartKey !== lastAutoStartedKey) {
        lastAutoStartedKey = autoStartKey;
        const gameId = await ClickInterceptor.resolveGameId(slowBtn as HTMLElement | null);
        setTimeout(() => {
          SingleDownloader.startDownloadFlow({
            fileId,
            gameId,
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

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}
