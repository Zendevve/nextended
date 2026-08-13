import { createLogger } from '../shared/logger.js';

const log = createLogger('no-wait');

const handledArchive = new WeakSet();
const handledForceNmm = new WeakSet();
const attachedSlowDl = new WeakSet();
const autoFiredIds = new Set();

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

function escapeAttr(str) {
  return String(str).replace(/[&"'<>]/g, (m) =>
    ({ '&': '&amp;', '"': '&quot;', "'": '&#39;', '<': '&lt;', '>': '&gt;' }[m])
  );
}

export function triggerDownload(url) {
  if (!url) return;
  if (url.startsWith('nxm://')) {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = url;
    document.body.appendChild(iframe);
    setTimeout(() => {
      try { iframe.remove(); } catch { /* removed */ }
    }, 30000);
  } else {
    window.location.assign(url);
  }
}

export async function resolveAndStartDownload(fileId, isNMM, href) {
  const loc = window.location;
  const gameSlug = loc.pathname.split('/')[1] || '';
  const modIdMatch = loc.pathname.match(/\/mods\/(\d+)/);
  const modId = modIdMatch ? modIdMatch[1] : '';

  if (isNMM) {
    if (gameSlug && modId && fileId) {
      const nxmUrl = `nxm://${gameSlug}/mods/${modId}/files/${fileId}`;
      log.info('Auto-triggering NXM download', { nxmUrl });
      triggerDownload(nxmUrl);
      return true;
    }
  }

  // Try slow download endpoint
  if (gameSlug && fileId) {
    try {
      const endpoint = `https://www.nexusmods.com/${gameSlug}/Core/Downloads/GenerateDownloadUrl?file_id=${fileId}${isNMM ? '&nmm=1' : ''}`;
      const resp = await fetch(endpoint, {
        method: 'GET',
        credentials: 'include',
        headers: { 'x-requested-with': 'XMLHttpRequest' },
      });
      const text = await resp.text();
      let json;
      try { json = JSON.parse(text); } catch { json = null; }
      const url = json?.url || json?.URL || json?.Url || json?.data?.URI || json?.data?.url;
      if (url) {
        log.info('Resolved download URL automatically', { url });
        triggerDownload(url);
        return true;
      }
    } catch (e) {
      log.warn('Failed to resolve direct download', { error: e?.message });
    }
  }

  if (href) {
    log.info('Fallback direct redirect', { href });
    window.location.assign(href);
    return true;
  }

  return false;
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
    if (success && settings.autoCloseTab) {
      setTimeout(() => {
        try { window.close(); } catch { /* ignore */ }
      }, settings.closeTabDelay || 2000);
    }
  });
}

export function setupSlowDownloadIntercept(settings = {}) {
  if (!isModPage()) return;
  const fid = new URLSearchParams(window.location.search).get('file_id');
  if (!fid) return;

  const slowBtn =
    document.querySelector('mod-file-download')?.shadowRoot?.querySelector('button') ||
    document.querySelector('#slowDownloadButton') ||
    document.querySelector('.btn-slow-download');

  if (!slowBtn || attachedSlowDl.has(slowBtn)) return;
  attachedSlowDl.add(slowBtn);

  const isNMM = isNMMDownload(slowBtn, window.location.search);
  slowBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();
    log.info('Slow download button clicked — bypassing 5s delay', { fid });
    const success = await resolveAndStartDownload(fid, isNMM, window.location.href);
    if (success && settings.autoCloseTab) {
      setTimeout(() => {
        try { window.close(); } catch { /* ignore */ }
      }, settings.closeTabDelay || 2000);
    }
  });

  if (settings.autoStartDownload && !autoFiredIds.has(fid)) {
    autoFiredIds.add(fid);
    log.info('Auto firing slow download button', { fid });
    resolveAndStartDownload(fid, isNMM, window.location.href).then((success) => {
      if (success && settings.autoCloseTab) {
        setTimeout(() => {
          try { window.close(); } catch { /* ignore */ }
        }, settings.closeTabDelay || 2000);
      }
    });
  }
}

export function interceptRequirements(settings = {}) {
  if (!settings.skipRequirements) return;
  document.body.addEventListener(
    'click',
    (e) => {
      if (!e.isTrusted || e.defaultPrevented) return;
      const link = e.composedPath ? e.composedPath().find((n) => n?.tagName === 'A') : e.target.closest('a');
      if (!link?.href?.includes('tab=requirements')) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      log.info('Bypassing requirements tab redirect');
      window.location.replace(link.href.replace('tab=requirements', 'tab=files'));
    },
    true
  );
}

export function archivedFileHandler(settings = {}) {
  if (!settings.handleArchivedFiles || !isModPage()) return;
  const url = window.location.href;
  if (url.includes('tab=files') && !url.includes('category=archived')) {
    const footer = document.querySelector('#files-tab-footer');
    if (footer && !handledArchive.has(footer)) {
      handledArchive.add(footer);
      const p = footer.querySelector('p');
      if (p) p.style.display = 'none';
      if (
        !Array.from(footer.querySelectorAll('a.btn.inline-flex .flex-label')).some(
          (el) => el.textContent.trim() === 'File archive'
        )
      ) {
        footer.insertAdjacentHTML(
          'beforeend',
          `<a class="btn inline-flex" data-archived-btn="true" href="${escapeAttr(url)}&category=archived" style="background:#da8e35;color:#fff;margin-left:8px;"><span class="flex-label">File archive</span></a>`
        );
      }
    }
  }

  if (!url.includes('category=archived')) return;

  const headers = document.querySelectorAll('.file-expander-header');
  headers.forEach((h, i) => {
    const box = document.querySelectorAll('.accordion-downloads')[i];
    const fileId = h?.dataset?.id;
    if (!fileId || !box || handledArchive.has(box)) return;
    handledArchive.add(box);
    const safeBase = escapeAttr(`${window.location.origin}${window.location.pathname}`);
    box.innerHTML = `<a class="btn inline-flex" href="${safeBase}?tab=files&file_id=${fileId}&nmm=1" style="background:#da8e35;color:#fff;margin-right:8px;"><span class="flex-label">Mod manager download</span></a> <a class="btn inline-flex" href="${safeBase}?tab=files&file_id=${fileId}" style="background:#4a5568;color:#fff;"><span class="flex-label">Manual download</span></a>`;
  });
}

export function forceModManagerHandler(settings = {}) {
  if (!settings.forceModManagerDownload || !isModPage()) return;
  const links = document.querySelectorAll(
    'a[href*="file_id="]:not([href*="nmm=1"]), a.btn[href*="tab=files"]:not([href*="nmm=1"])'
  );
  links.forEach((link) => {
    if (handledForceNmm.has(link)) return;
    const text = (link.textContent || link.getAttribute('aria-label') || '').toLowerCase();
    if (!text.includes('manual')) return;

    let sArea = link.parentElement;
    let hasManager = false;
    for (let i = 0; i < 3 && sArea; i++, sArea = sArea.parentElement) {
      if (
        Array.from(sArea.querySelectorAll('a, button')).some(
          (el) =>
            el !== link &&
            (el.href?.includes('nmm=1') ||
              /manager|vortex/i.test(el.textContent || el.getAttribute('aria-label') || ''))
        )
      ) {
        hasManager = true;
        break;
      }
    }
    handledForceNmm.add(link);
    if (hasManager) return;

    const isLi = link.parentElement?.tagName === 'LI';
    const node = isLi ? link.parentElement : link;
    const clone = node.cloneNode(true);
    const ml = isLi ? clone.querySelector('a') : clone;
    if (ml && ml.href?.includes('file_id=')) {
      ml.href = appendNmmParam(ml.href);
    }
    const lbl = ml ? ml.querySelector('.flex-label') || ml : null;
    if (lbl) {
      lbl.textContent = text.includes('download')
        ? 'Mod Manager Download'
        : 'Mod Manager';
    }
    if (node.parentNode) {
      node.parentNode.insertBefore(clone, node);
    }
  });
}
