import { MESSAGE_TYPES } from '../shared/constants.js';
import { createLogger } from '../shared/logger.js';
import { showToast } from './toast.js';

const log = createLogger('requirements-bundler');

function sendMessage(message) {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
      resolve({ ok: false, error: 'Extension messaging unavailable' });
      return;
    }
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
      } else {
        resolve(response?.result || response || { ok: false });
      }
    });
  });
}

export class RequirementsBundler {
  constructor() {
    this.modal = null;
    this._keyDownHandler = null;
    this.crawledTree = null;
  }

  isModPage() {
    return /\/mods\/\d+/i.test(window.location.pathname);
  }

  getModDetailsFromPage() {
    const parts = window.location.pathname.split('/');
    const gameDomain = parts[1] || '';
    const modIdMatch = window.location.pathname.match(/\/mods\/(\d+)/);
    const modId = modIdMatch ? modIdMatch[1] : '';
    const nameEl = document.querySelector('h1') || document.querySelector('.mod-name');
    const modName = nameEl ? nameEl.textContent.trim() : 'Current Mod';

    return { gameDomain, modId, modName };
  }

  injectBundleButton() {
    if (!this.isModPage()) return;
    if (document.querySelector('[data-nxdt-bundle-btn="true"]')) return;

    const actionArea =
      document.querySelector('.mod-actions') ||
      document.querySelector('.actions') ||
      document.querySelector('#section .files-tab') ||
      document.querySelector('.tabbed-block');

    if (!actionArea) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn inline-flex nxdt-bundle-trigger-btn';
    btn.setAttribute('data-nxdt-bundle-btn', 'true');
    btn.innerHTML = `<span class="flex-label">📦 Download Mod + Requirements</span>`;

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      this.openRequirementsModal();
    });

    const targetHeader = document.querySelector('.header-actions') || actionArea;
    targetHeader.appendChild(btn);
  }

  parseRequirementsFromPage() {
    const reqs = [];
    const rows = document.querySelectorAll(
      '.table-requirements tr, #requirements-table tr, .tab-requirements tr, [data-requirement-id]'
    );

    rows.forEach((row) => {
      const link = row.querySelector('a');
      if (!link) return;
      const text = link.textContent.trim();
      const href = link.href;
      if (!text || !href) return;

      const isNexus = href.includes('nexusmods.com');
      const modIdMatch = href.match(/\/mods\/(\d+)/);
      const isOffsite = !isNexus || !modIdMatch;

      reqs.push({
        name: text,
        url: href,
        isNexus,
        isOffsite,
        modId: modIdMatch ? modIdMatch[1] : null,
        notes: row.querySelector('.notes')?.textContent?.trim() || '',
        depth: 1,
        selected: true,
      });
    });

    return reqs;
  }

  closeModal() {
    if (this._keyDownHandler) {
      document.removeEventListener('keydown', this._keyDownHandler);
      this._keyDownHandler = null;
    }
    if (this.modal) {
      this.modal.remove();
      this.modal = null;
    }
  }

  async openRequirementsModal() {
    const { gameDomain, modId, modName } = this.getModDetailsFromPage();
    let requirements = this.parseRequirementsFromPage();

    this.closeModal();

    const nexusCount = requirements.filter((r) => !r.isOffsite).length;
    const totalCount = requirements.length;

    this.modal = document.createElement('div');
    this.modal.className = 'nxdt-modal-overlay';
    this.modal.setAttribute('data-nxdt-modal', 'true');
    this.modal.innerHTML = `
      <div class="nxdt-modal-box">
        <div class="nxdt-modal-header">
          <h3>📦 Smart Requirements & Dependency Resolver</h3>
          <button class="nxdt-modal-close" id="nxdt-req-close" aria-label="Close">✕</button>
        </div>
        <div class="nxdt-modal-body">
          <p class="nxdt-modal-desc">
            Mod: <b>${modName}</b> (Game: <code>${gameDomain}</code>)
          </p>
          ${
            totalCount === 0
              ? `<div class="nxdt-empty-notice">No direct requirements found on page. Mod will be queued directly.</div>`
              : `
              <div class="nxdt-modal-search-bar">
                <input type="search" id="nxdt-req-search" class="nxdt-req-search" placeholder="Filter requirements & dependencies..." />
              </div>
              <div class="nxdt-req-toolbar" style="display: flex; gap: 8px; margin: 8px 0; flex-wrap: wrap;">
                <button type="button" class="nxdt-btn-sm" id="nxdt-req-select-all">Select All (<span id="nxdt-all-count">${totalCount}</span>)</button>
                <button type="button" class="nxdt-btn-sm" id="nxdt-req-select-nexus">Select Nexus Only (${nexusCount})</button>
                <button type="button" class="nxdt-btn-sm" id="nxdt-req-deselect-all">Deselect All (0)</button>
                <button type="button" class="nxdt-btn-sm nxdt-btn-crawl" id="nxdt-req-crawl-tree">🔍 Deep Crawl Tree</button>
              </div>
              <div class="nxdt-req-section-title">Requirements & Dependencies (<span id="nxdt-req-count">${totalCount}</span>):</div>
              <div class="nxdt-req-list nxdt-modal-list" id="nxdt-req-container">
                ${this.renderRequirementItems(requirements)}
              </div>
            `
          }
        </div>
        <div class="nxdt-modal-footer">
          <button class="nxdt-btn nxdt-btn-dark nxdt-btn-secondary" id="nxdt-req-cancel">Cancel</button>
          <button class="nxdt-btn nxdt-btn-amber nxdt-btn-primary" id="nxdt-req-enqueue">⚡ Queue in Dependency Order</button>
        </div>
      </div>
    `;

    document.body.appendChild(this.modal);

    const close = () => this.closeModal();

    this._keyDownHandler = (e) => {
      if (e.key === 'Escape') {
        close();
      }
    };
    document.addEventListener('keydown', this._keyDownHandler);

    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        close();
      }
    });

    this.modal.querySelector('#nxdt-req-close')?.addEventListener('click', close);
    this.modal.querySelector('#nxdt-req-cancel')?.addEventListener('click', close);

    const updateCountBadge = () => {
      const countSpan = this.modal?.querySelector('#nxdt-req-count');
      if (!countSpan) return;
      const checked = this.modal.querySelectorAll('.nxdt-req-item input[type="checkbox"]:checked').length;
      countSpan.textContent = String(checked);
    };

    const attachItemListeners = () => {
      this.modal.querySelectorAll('.nxdt-req-item input[type="checkbox"]').forEach((cb) => {
        cb.addEventListener('change', updateCountBadge);
      });
    };
    attachItemListeners();

    // Deep Crawl button handler
    const crawlBtn = this.modal.querySelector('#nxdt-req-crawl-tree');
    if (crawlBtn) {
      crawlBtn.addEventListener('click', async () => {
        crawlBtn.disabled = true;
        crawlBtn.textContent = '⏳ Crawling dependencies...';
        try {
          const res = await sendMessage({
            type: MESSAGE_TYPES.CRAWL_DEPENDENCY_TREE,
            payload: { gameDomain, modId, maxDepth: 3 },
          });

          if (res?.flattened && res.flattened.length > 0) {
            const crawledItems = res.flattened.map((node) => ({
              name: node.name,
              url: `https://www.nexusmods.com/${gameDomain}/mods/${node.modId}`,
              isNexus: true,
              isOffsite: false,
              modId: String(node.modId),
              notes: node.isExtender ? 'Script Extender' : node.isFramework ? 'Framework' : '',
              depth: node.depth,
              selected: true,
            }));

            // Merge with existing requirements avoiding duplicates
            const existingModIds = new Set(requirements.map((r) => r.modId).filter(Boolean));
            crawledItems.forEach((item) => {
              if (!existingModIds.has(item.modId)) {
                requirements.push(item);
                existingModIds.add(item.modId);
              }
            });

            const container = this.modal.querySelector('#nxdt-req-container');
            if (container) {
              container.innerHTML = this.renderRequirementItems(requirements);
              attachItemListeners();
              updateCountBadge();
              const allCountEl = this.modal.querySelector('#nxdt-all-count');
              if (allCountEl) allCountEl.textContent = String(requirements.length);
            }

            crawlBtn.textContent = `✓ Crawled (${res.flattened.length} Sub-Deps)`;
            showToast(`Resolved ${res.flattened.length} nested dependencies`, 'success');
          } else {
            crawlBtn.textContent = '✓ Tree Complete';
          }
        } catch (err) {
          log.warn('Failed to crawl dependency tree', { error: err?.message });
          crawlBtn.textContent = 'Deep Crawl Tree';
          crawlBtn.disabled = false;
        }
      });
    }

    // Search filter input
    const searchInput = this.modal.querySelector('#nxdt-req-search');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        const q = searchInput.value.toLowerCase().trim();
        const items = this.modal.querySelectorAll('.nxdt-req-item');
        items.forEach((item) => {
          const name = item.querySelector('.nxdt-req-name')?.textContent || '';
          if (!q || name.toLowerCase().includes(q)) {
            item.style.display = '';
          } else {
            item.style.display = 'none';
          }
        });
      });
    }

    // Quick-select toolbar buttons
    this.modal.querySelector('#nxdt-req-select-all')?.addEventListener('click', () => {
      this.modal.querySelectorAll('.nxdt-req-item input[type="checkbox"]').forEach((cb) => {
        cb.checked = true;
      });
      updateCountBadge();
    });

    this.modal.querySelector('#nxdt-req-select-nexus')?.addEventListener('click', () => {
      requirements.forEach((req, idx) => {
        const cb = this.modal.querySelector(`input[data-idx="${idx}"]`);
        if (cb) {
          cb.checked = !req.isOffsite;
        }
      });
      updateCountBadge();
    });

    this.modal.querySelector('#nxdt-req-deselect-all')?.addEventListener('click', () => {
      this.modal.querySelectorAll('.nxdt-req-item input[type="checkbox"]').forEach((cb) => {
        cb.checked = false;
      });
      updateCountBadge();
    });

    const enqueueBtn = this.modal.querySelector('#nxdt-req-enqueue');
    const cancelBtn = this.modal.querySelector('#nxdt-req-cancel');

    enqueueBtn?.addEventListener('click', async () => {
      const itemsToQueue = [];

      // Sort requirements so highest depth (deepest sub-dependencies) install first
      const selectedReqs = [];
      requirements.forEach((req, idx) => {
        const checkbox = this.modal.querySelector(`input[data-idx="${idx}"]`);
        if (checkbox && checkbox.checked) {
          selectedReqs.push(req);
        }
      });

      selectedReqs.sort((a, b) => (b.depth || 1) - (a.depth || 1));

      // Append selected requirements first (dependencies before main mod)
      selectedReqs.forEach((req) => {
        itemsToQueue.push({
          modId: req.modId || '0',
          gameDomain,
          modName: req.name,
          fileName: `${req.name}.zip`,
          isNMM: req.isNexus,
          isExternal: req.isOffsite,
          externalUrl: req.isOffsite ? req.url : null,
          sourceUrl: req.url,
        });
      });

      // Main mod last (installed on top of satisfied requirements)
      itemsToQueue.push({
        modId,
        gameDomain,
        modName,
        fileName: `${modName}.zip`,
        isNMM: true,
        sourceUrl: window.location.href,
      });

      if (enqueueBtn) {
        enqueueBtn.disabled = true;
        enqueueBtn.textContent = '⚡ Enqueuing...';
      }
      if (cancelBtn) {
        cancelBtn.disabled = true;
      }

      try {
        await chrome.runtime.sendMessage({
          type: MESSAGE_TYPES.ENQUEUE_ITEMS,
          payload: { items: itemsToQueue },
        });
        log.info('Queued requirements bundle in dependency order', { count: itemsToQueue.length });
        showToast(
          `Queued ${itemsToQueue.length} ${itemsToQueue.length === 1 ? 'mod' : 'mods'} to background download`,
          'success'
        );
      } catch (err) {
        log.warn('Failed to enqueue requirements', { error: err?.message });
        showToast('Failed to queue requirements', 'warning');
      }

      close();
    });
  }

  renderRequirementItems(requirements) {
    return requirements
      .map(
        (req, idx) => `
      <label class="nxdt-req-item nxdt-modal-row ${req.isOffsite ? 'nxdt-offsite' : ''}" data-idx="${idx}">
        <div class="nxdt-modal-row-left">
          <input type="checkbox" data-idx="${idx}" ${req.selected ? 'checked' : ''} />
          <span class="nxdt-req-name nxdt-modal-row-title">${req.name}</span>
          ${req.depth && req.depth > 1 ? `<span class="nxdt-depth-tag">L${req.depth} Sub-Dep</span>` : ''}
        </div>
        <div class="nxdt-modal-row-right">
          ${
            req.isOffsite
              ? `<span class="nxdt-pill-tag nxdt-pill-offsite nxdt-tag-optional">Off-Site ↗</span>`
              : `<span class="nxdt-pill-tag nxdt-pill-nexus nxdt-tag-mandatory">Nexus</span>`
          }
        </div>
      </label>
    `
      )
      .join('');
  }
}
