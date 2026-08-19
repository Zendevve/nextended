import { createLogger } from '../shared/logger.js';
import { MESSAGE_TYPES } from '../shared/constants.js';
import { showToast } from './toast.js';
import {
  FILES_TAB_FOOTER_SELECTOR,
  FILE_EXPANDER_HEADER_SELECTOR,
  ACCORDION_DOWNLOADS_SELECTOR,
  FLEX_LABEL_SELECTOR,
  ARCHIVE_BTN_LABEL_SELECTOR,
  ARCHIVED_ENTRY_BTN_SELECTOR,
  ARCHIVED_DL_BTN_SELECTOR,
  FORCE_MANAGER_BTN_SELECTOR,
  FORCE_MANAGER_LINK_SELECTORS,
  SIBLING_ACTION_SELECTOR,
  querySlowDownloadButton,
} from './selectors.js';

const log = createLogger('no-wait');

const MESSAGE_RESOLVE_ARCHIVED_DOWNLOAD = MESSAGE_TYPES.RESOLVE_ARCHIVED_DOWNLOAD;

const REQUIREMENTS_LISTENER_OPTIONS = { capture: true };
const MAX_ANCESTOR_DEPTH = 6;

const handledArchive = new WeakSet();
const handledForceNmm = new WeakSet();
const attachedSlowDl = new WeakSet();
const autoFiredIds = new Set();

// Strong refs so WeakSet entries can be cleared on disable (WeakSet is not
// iterable). The elements live in the page for its whole lifetime.
const archivedFooters = [];
const archivedBoxes = [];
const forceLinks = [];
const slowDlButtons = [];
const slowDlHandlers = new WeakMap();

let requirementsListener = null;

export function isModPage(loc = window.location) {
  if (!loc || !loc.pathname) return false;
  return /\/mods\/\d+/i.test(loc.pathname) || loc.pathname.includes('/mods/');
}

export function extractFileId(href) {
  if (!href) return null;
  try {
    const u = href.startsWith('nxm://')
      ? new URLSearchParams(href.substring(href.indexOf('?')))
      : new URL(href, window.location.href).searchParams;
    return (
      u.get('id') ||
      u.get('file_id') ||
      new URL(href, window.location.href).pathname.match(/\/files\/(\d+)/)?.[1] ||
      null
    );
  } catch {
    return null;
  }
}

export function isNMMDownload(el, href = '') {
  if (href && (href.startsWith('nxm://') || href.includes('nmm=1') || href.includes('&nmm=1'))) {
    return true;
  }
  if (!el) return false;
  if (el.dataset?.nxdtIsNmm !== undefined) {
    return el.dataset.nxdtIsNmm === '1';
  }
  if (el.id === 'action-vortex' || el.id === 'action-nmm') return true;
  const text = (el.textContent || el.getAttribute('aria-label') || '').toLowerCase();
  return /(vortex|mod manager|manager download)/i.test(text);
}

export function appendNmmParam(href) {
  if (!href || href.includes('nmm=1')) return href;
  return `${href}${href.includes('?') ? '&' : '?'}nmm=1`;
}

export function renderDownloadFallback(url) {
  if (typeof document === 'undefined' || !url) return null;
  const existing = document.querySelectorAll('[data-nxdt-fallback-notice]');
  existing.forEach((el) => el.remove());

  const isNmm = url.startsWith('nxm://');
  const notice = document.createElement('div');
  notice.className = 'nxdt-fallback-notice';
  notice.setAttribute('data-nxdt-fallback-notice', 'true');
  notice.style.cssText =
    'display: inline-flex; align-items: center; gap: 8px; margin: 8px 0; padding: 6px 14px; background: rgba(32, 35, 39, 0.95); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border: 1px solid #444c56; border-radius: 20px; font-size: 12px; color: #e6edf3; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);';
  notice.innerHTML = `
    <span style="display:inline-flex;align-items:center;gap:6px;">
      <span class="nxdt-pulse-dot" style="display:inline-block;width:6px;height:6px;background:#3fb950;border-radius:50%;"></span>
      <span><b>Auto-Download:</b> Countdown skipped.</span>
    </span>
    <a href="${url}" class="nxdt-fallback-link" ${isNmm ? '' : 'download'} style="color:#58a6ff;text-decoration:underline;cursor:pointer;margin-left:4px;">Click here if download didn't start</a>
  `;

  const slowBtn =
    document.querySelector('#slowDownloadButton') ||
    document.querySelector('.slow-download') ||
    document.querySelector('#slow-download-wrap');
  if (slowBtn && slowBtn.parentElement) {
    slowBtn.parentElement.appendChild(notice);
  } else {
    const mainArea =
      document.querySelector('.accordion-downloads') ||
      document.querySelector('.files-tab') ||
      document.querySelector('.main') ||
      document.body;
    if (mainArea) {
      mainArea.appendChild(notice);
    }
  }
  return notice;
}

export function triggerDownload(url) {
  if (!url) return;
  if (url.startsWith('nxm://')) {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = url;
    document.body.appendChild(iframe);
    setTimeout(() => {
      try {
        iframe.remove();
      } catch {
        /* removed */
      }
    }, 30000);
  } else {
    window.location.assign(url);
  }
  try {
    renderDownloadFallback(url);
  } catch {
    // ignore in non-DOM environment
  }
}

function safeUrlHost(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export function resolveAndStartDownload(fileId, isNMM, href) {
  const loc = window.location;
  const gameSlug = loc.pathname.split('/')[1] || '';
  const modIdMatch = loc.pathname.match(/\/mods\/(\d+)/);
  const modId = modIdMatch ? modIdMatch[1] : '';

  if (isNMM) {
    if (gameSlug && modId && fileId) {
      const nxmUrl = `nxm://${gameSlug}/mods/${modId}/files/${fileId}`;
      log.info('Auto-triggering NXM download', { nxmUrl, from: href });
      triggerDownload(nxmUrl);
      showToast('Auto-started NXM download (countdown bypassed)', 'info');
      return Promise.resolve(true);
    }
    return Promise.resolve(false);
  }

  // HTTPS path: resolve in the service worker (which validates the URL).
  // Never fetch from the content script and never navigate on failure.
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    try {
      chrome.runtime.sendMessage(
        {
          type: MESSAGE_RESOLVE_ARCHIVED_DOWNLOAD,
          payload: { fileId, slug: gameSlug, modId, isNMM: false },
        },
        (res) => {
          if (chrome.runtime.lastError) {
            log.warn('Failed to resolve archived download', {
              fileId,
              error: chrome.runtime.lastError.message,
            });
            return finish(false);
          }
          if (res && res.success && res.result && res.result.url) {
            log.info('Resolved download URL automatically', {
              fileId,
              host: safeUrlHost(res.result.url),
            });
            triggerDownload(res.result.url);
            showToast('Auto-started download (countdown bypassed)', 'info');
            return finish(true);
          }
          log.warn('Failed to resolve archived download', {
            fileId,
            error: (res && res.error) || (res && res.result && res.result.error) || 'no URL returned',
          });
          finish(false);
        }
      );
    } catch (e) {
      log.warn('Failed to resolve archived download', { fileId, error: e && e.message });
      finish(false);
    }
  });
}

export function autoStartDownload(settings = {}) {
  if (!settings.autoStartDownload || !isModPage()) return;
  const loc = window.location;
  if (loc.search.includes('tab=files') && !loc.pathname.includes('/files/')) return;

  const fileId = new URLSearchParams(loc.search).get('file_id') || extractFileId(loc.href);
  if (!fileId || autoFiredIds.has(fileId)) return;
  autoFiredIds.add(fileId);

  log.info('Auto start download triggered for file', { fileId });
  const isNMM = isNMMDownload(null, loc.search);
  resolveAndStartDownload(fileId, isNMM, loc.href).then((success) => {
    if (!success) {
      // Never navigate or reload on failure; keep the page put.
      log.warn('Auto start download failed for file', { fileId });
      return;
    }
    if (settings.autoCloseTab) {
      setTimeout(() => {
        try {
          window.close();
        } catch {
          /* ignore */
        }
      }, settings.closeTabDelay || 2000);
    }
  });
}

export function setupSlowDownloadIntercept(settings = {}) {
  if (!isModPage()) return;
  const fid = new URLSearchParams(window.location.search).get('file_id');
  if (!fid) return;

  const slowBtn = querySlowDownloadButton();
  if (!slowBtn || attachedSlowDl.has(slowBtn)) return;
  attachedSlowDl.add(slowBtn);

  const isNMM = isNMMDownload(slowBtn, window.location.search);
  const onClick = async (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();
    log.info('Slow download button clicked — bypassing 5s delay', { fid });
    const success = await resolveAndStartDownload(fid, isNMM, window.location.href);
    if (!success) {
      log.warn('Slow download bypass failed for file', { fid });
      // The native click flow was already suppressed via
      // stopImmediatePropagation, so reload to let the native handler run.
      // The auto-start path never navigates on failure, so no reload loop.
      window.location.assign(window.location.href);
      return;
    }
    if (settings.autoCloseTab) {
      setTimeout(() => {
        try {
          window.close();
        } catch {
          /* ignore */
        }
      }, settings.closeTabDelay || 2000);
    }
  };
  slowBtn.addEventListener('click', onClick);
  slowDlHandlers.set(slowBtn, onClick);
  slowDlButtons.push(slowBtn);

  if (settings.autoStartDownload && !autoFiredIds.has(fid)) {
    autoFiredIds.add(fid);
    log.info('Auto firing slow download button', { fid });
    resolveAndStartDownload(fid, isNMM, window.location.href).then((success) => {
      if (!success) {
        log.warn('Auto fire slow download failed for file', { fid });
        return;
      }
      if (settings.autoCloseTab) {
        setTimeout(() => {
          try {
            window.close();
          } catch {
            /* ignore */
          }
        }, settings.closeTabDelay || 2000);
      }
    });
  }
}

export function interceptRequirements(settings = {}) {
  if (settings.skipRequirements) {
    if (!requirementsListener) {
      requirementsListener = (e) => {
        if (!e.isTrusted || e.defaultPrevented) return;
        const link = e.composedPath
          ? e.composedPath().find((n) => n && n.tagName === 'A')
          : e.target.closest('a');
        if (!link || !link.href || !link.href.includes('tab=requirements')) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        log.info('Bypassing requirements tab redirect');
        window.location.replace(link.href.replace('tab=requirements', 'tab=files'));
      };
      document.body.addEventListener('click', requirementsListener, REQUIREMENTS_LISTENER_OPTIONS);
    }
  } else {
    removeRequirementsListener();
  }
}

function removeRequirementsListener() {
  if (requirementsListener) {
    document.body.removeEventListener('click', requirementsListener, REQUIREMENTS_LISTENER_OPTIONS);
    requirementsListener = null;
  }
}

export function archivedFileHandler(settings = {}) {
  if (!settings.handleArchivedFiles || !isModPage()) return;
  const url = window.location.href;

  for (let i = archivedFooters.length - 1; i >= 0; i--) {
    const el = archivedFooters[i];
    if (!el || !el.isConnected) {
      handledArchive.delete(el);
      archivedFooters.splice(i, 1);
    }
  }
  for (let i = archivedBoxes.length - 1; i >= 0; i--) {
    const el = archivedBoxes[i];
    if (!el || !el.isConnected) {
      handledArchive.delete(el);
      archivedBoxes.splice(i, 1);
    }
  }

  if (url.includes('tab=files') && !url.includes('category=archived')) {
    const footer = document.querySelector(FILES_TAB_FOOTER_SELECTOR);
    if (footer && !handledArchive.has(footer)) {
      handledArchive.add(footer);
      archivedFooters.push(footer);
      const hasArchiveBtn = Array.from(footer.querySelectorAll(ARCHIVE_BTN_LABEL_SELECTOR)).some(
        (el) => el.textContent.trim() === 'File archive'
      );
      if (!hasArchiveBtn) {
        const link = document.createElement('a');
        link.className = 'btn inline-flex';
        link.setAttribute('data-nxdt-archived-btn', 'true');
        link.href = `${url}${url.includes('?') ? '&' : '?'}category=archived`;
        link.style.cssText = 'background:#da8e35;color:#fff;margin-left:8px;';
        const label = document.createElement('span');
        label.className = 'flex-label';
        label.textContent = 'File archive';
        link.appendChild(label);
        footer.appendChild(link);
      }
    }
  }

  if (!url.includes('category=archived')) return;

  const boxes = Array.from(document.querySelectorAll(ACCORDION_DOWNLOADS_SELECTOR));
  const headers = Array.from(document.querySelectorAll(FILE_EXPANDER_HEADER_SELECTOR));
  if (!headers.length || !boxes.length) return;
  // Early bail: every download box already has its buttons.
  if (boxes.every((b) => handledArchive.has(b))) return;

  headers.forEach((h, i) => {
    const fileId = h && h.dataset ? h.dataset.id : null;
    if (!fileId) return;
    // Pair by shared ancestor first; positional index is the last resort.
    const box = findAccordionBox(h) || boxes[i];
    if (!box || handledArchive.has(box)) return;
    handledArchive.add(box);
    archivedBoxes.push(box);
    appendArchivedDownloadButtons(box, fileId);
  });
}

function findAccordionBox(header) {
  let el = header.parentElement;
  for (let depth = 0; el && depth < MAX_ANCESTOR_DEPTH; depth += 1, el = el.parentElement) {
    const box = el.querySelector(ACCORDION_DOWNLOADS_SELECTOR);
    if (box) return box;
  }
  return null;
}

function appendArchivedDownloadButtons(box, fileId) {
  const safeBase = `${window.location.origin}${window.location.pathname}`;

  const manager = document.createElement('a');
  manager.className = 'btn inline-flex';
  manager.setAttribute('data-nxdt-archived-dl', 'manager');
  manager.href = `${safeBase}?tab=files&file_id=${fileId}&nmm=1`;
  manager.style.cssText = 'background:#da8e35;color:#fff;margin-right:8px;';
  const managerLabel = document.createElement('span');
  managerLabel.className = 'flex-label';
  managerLabel.textContent = 'Mod manager download';
  manager.appendChild(managerLabel);

  const manual = document.createElement('a');
  manual.className = 'btn inline-flex';
  manual.setAttribute('data-nxdt-archived-dl', 'manual');
  manual.href = `${safeBase}?tab=files&file_id=${fileId}`;
  manual.style.cssText = 'background:#4a5568;color:#fff;';
  const manualLabel = document.createElement('span');
  manualLabel.className = 'flex-label';
  manualLabel.textContent = 'Manual download';
  manual.appendChild(manualLabel);

  // Append, never overwrite: preserve native children (sizes, timestamps,
  // controls) already inside the box.
  box.appendChild(manager);
  box.appendChild(manual);
}

export function forceModManagerHandler(settings = {}) {
  if (!settings.forceModManagerDownload || !isModPage()) return;

  for (let i = forceLinks.length - 1; i >= 0; i--) {
    const el = forceLinks[i];
    if (!el || !el.isConnected) {
      handledForceNmm.delete(el);
      forceLinks.splice(i, 1);
    }
  }

  const links = document.querySelectorAll(FORCE_MANAGER_LINK_SELECTORS.join(','));
  links.forEach((link) => {
    if (handledForceNmm.has(link)) return;
    const text = (link.textContent || link.getAttribute('aria-label') || '').toLowerCase();
    if (!text.includes('manual')) return;

    let sArea = link.parentElement;
    let hasManager = false;
    for (let i = 0; i < 3 && sArea; i++, sArea = sArea.parentElement) {
      if (
        Array.from(sArea.querySelectorAll(SIBLING_ACTION_SELECTOR)).some(
          (el) =>
            el !== link &&
            ((el.href && el.href.includes('nmm=1')) ||
              /manager|vortex/i.test(el.textContent || el.getAttribute('aria-label') || ''))
        )
      ) {
        hasManager = true;
        break;
      }
    }
    handledForceNmm.add(link);
    if (hasManager) return;

    const isLi = link.parentElement && link.parentElement.tagName === 'LI';
    const node = isLi ? link.parentElement : link;
    const clone = node.cloneNode(true);
    clone.setAttribute('data-nxdt-force-manager', 'true');
    const ml = isLi ? clone.querySelector('a') : clone;
    if (ml && ml.href && ml.href.includes('file_id=')) {
      ml.href = appendNmmParam(ml.href);
    }
    const lbl = ml ? ml.querySelector(FLEX_LABEL_SELECTOR) || ml : null;
    if (lbl) {
      lbl.textContent = text.includes('download') ? 'Mod Manager Download' : 'Mod Manager';
    }
    if (node.parentNode) {
      node.parentNode.insertBefore(clone, node);
      forceLinks.push(link);
    }
  });
}

export function removeArchivedInjected() {
  document.querySelectorAll(ARCHIVED_ENTRY_BTN_SELECTOR).forEach((el) => el.remove());
  document.querySelectorAll(ARCHIVED_DL_BTN_SELECTOR).forEach((el) => el.remove());
  for (const el of archivedFooters) handledArchive.delete(el);
  for (const el of archivedBoxes) handledArchive.delete(el);
  archivedFooters.length = 0;
  archivedBoxes.length = 0;
}

export function removeForceInjected() {
  document.querySelectorAll(FORCE_MANAGER_BTN_SELECTOR).forEach((el) => el.remove());
  for (const el of forceLinks) handledForceNmm.delete(el);
  forceLinks.length = 0;
}

export function removeSlowDownloadIntercepts() {
  for (const btn of slowDlButtons) {
    const handler = slowDlHandlers.get(btn);
    if (handler) btn.removeEventListener('click', handler);
    slowDlHandlers.delete(btn);
    attachedSlowDl.delete(btn);
  }
  slowDlButtons.length = 0;
}

export function applyNoWaitFeatures(settings = {}) {
  if (settings.enabled === false) {
    resetNoWaitState();
    return;
  }
  interceptRequirements(settings);
  if (settings.handleArchivedFiles) {
    archivedFileHandler(settings);
  } else {
    removeArchivedInjected();
  }
  if (settings.forceModManagerDownload) {
    forceModManagerHandler(settings);
  } else {
    removeForceInjected();
  }
  if (settings.autoStartDownload) {
    autoStartDownload(settings);
  }
  setupSlowDownloadIntercept(settings);
}

export function resetNoWaitState() {
  autoFiredIds.clear();
  removeRequirementsListener();
  removeArchivedInjected();
  removeForceInjected();
  removeSlowDownloadIntercepts();
  if (typeof document !== 'undefined') {
    document.querySelectorAll('[data-nxdt-fallback-notice]').forEach((el) => el.remove());
  }
}
