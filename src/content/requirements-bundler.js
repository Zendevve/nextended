import { MESSAGE_TYPES } from '../shared/constants.js';
import { createLogger } from '../shared/logger.js';

const log = createLogger('requirements-bundler');

export class RequirementsBundler {
  constructor() {
    this.modal = null;
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
    btn.style.cssText = 'background: #da8e35; color: #fff; margin: 4px 8px; font-weight: 600; cursor: pointer; border-radius: 4px; padding: 6px 14px; border: none;';
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
        selected: true,
      });
    });

    return reqs;
  }

  async openRequirementsModal() {
    const { gameDomain, modId, modName } = this.getModDetailsFromPage();
    const requirements = this.parseRequirementsFromPage();

    if (this.modal) this.modal.remove();

    this.modal = document.createElement('div');
    this.modal.className = 'nxdt-modal-overlay';
    this.modal.innerHTML = `
      <div class="nxdt-modal-box">
        <div class="nxdt-modal-header">
          <h3>📦 Smart Requirements Bundler</h3>
          <button class="nxdt-modal-close" id="nxdt-req-close">✕</button>
        </div>
        <div class="nxdt-modal-body">
          <p class="nxdt-modal-desc">
            Mod: <b>${modName}</b> (Game: <code>${gameDomain}</code>)
          </p>
          <div class="nxdt-req-section-title">Requirements & Dependencies (${requirements.length}):</div>
          ${
            requirements.length === 0
              ? `<div class="nxdt-empty-notice">No external requirements found on this page. Mod will be queued directly.</div>`
              : `
              <div class="nxdt-req-list">
                ${requirements
                  .map(
                    (req, idx) => `
                  <label class="nxdt-req-item ${req.isOffsite ? 'nxdt-offsite' : ''}">
                    <input type="checkbox" data-idx="${idx}" ${req.selected ? 'checked' : ''} />
                    <span class="nxdt-req-name">${req.name}</span>
                    ${
                      req.isOffsite
                        ? `<span class="nxdt-pill-tag nxdt-pill-offsite">Off-Site ↗</span>`
                        : `<span class="nxdt-pill-tag nxdt-pill-nexus">Nexus</span>`
                    }
                  </label>
                `
                  )
                  .join('')}
              </div>
            `
          }
        </div>
        <div class="nxdt-modal-footer">
          <button class="nxdt-btn nxdt-btn-dark" id="nxdt-req-cancel">Cancel</button>
          <button class="nxdt-btn nxdt-btn-amber" id="nxdt-req-enqueue">⚡ Queue Selected to Background</button>
        </div>
      </div>
    `;

    document.body.appendChild(this.modal);

    const close = () => {
      if (this.modal) {
        this.modal.remove();
        this.modal = null;
      }
    };

    this.modal.querySelector('#nxdt-req-close')?.addEventListener('click', close);
    this.modal.querySelector('#nxdt-req-cancel')?.addEventListener('click', close);

    this.modal.querySelector('#nxdt-req-enqueue')?.addEventListener('click', async () => {
      const itemsToQueue = [];

      // Main mod
      itemsToQueue.push({
        modId,
        gameDomain,
        modName,
        fileName: `${modName}.zip`,
        isNMM: true,
        sourceUrl: window.location.href,
      });

      // Selected requirements
      requirements.forEach((req, idx) => {
        const checkbox = this.modal.querySelector(`input[data-idx="${idx}"]`);
        if (checkbox && checkbox.checked) {
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
        }
      });

      try {
        await chrome.runtime.sendMessage({
          type: MESSAGE_TYPES.ENQUEUE_ITEMS,
          payload: { items: itemsToQueue },
        });
        log.info('Queued requirements bundle', { count: itemsToQueue.length });
      } catch (err) {
        log.warn('Failed to enqueue requirements', { error: err?.message });
      }

      close();
    });
  }
}
