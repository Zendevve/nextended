import { MESSAGE_TYPES } from '../shared/constants.js';
import { createLogger } from '../shared/logger.js';

const log = createLogger('inventory-sync');

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

export class InventoryAnnotator {
  constructor() {
    this.gameDomain = '';
    this.inventory = null;
    this.annotatedElements = new WeakSet();
  }

  getGameDomain() {
    const parts = window.location.pathname.split('/');
    return parts[1] || '';
  }

  async loadInventory() {
    try {
      const res = await sendMessage({ type: MESSAGE_TYPES.GET_INVENTORY });
      this.inventory = res?.inventory || null;
      this.gameDomain = this.getGameDomain();
    } catch (err) {
      log.warn('Failed to load inventory for annotations', { error: err?.message });
    }
  }

  /**
   * Annotates the main mod header on mod pages.
   */
  async annotateModHeader() {
    const modIdMatch = window.location.pathname.match(/\/mods\/(\d+)/i);
    if (!modIdMatch) return;
    const modId = modIdMatch[1];
    const nameEl = document.querySelector('h1') || document.querySelector('.mod-name');
    if (!nameEl || this.annotatedElements.has(nameEl)) return;

    const modName = nameEl.textContent.trim();
    const versionEl = document.querySelector('.version, .mod-version, [data-version]');
    const onlineVersion = versionEl ? versionEl.textContent.trim() : null;

    const matchRes = await sendMessage({
      type: MESSAGE_TYPES.CHECK_MOD_INVENTORY,
      payload: {
        gameDomain: this.gameDomain,
        modId,
        modName,
        onlineVersion,
      },
    });

    if (!matchRes) return;

    this.annotatedElements.add(nameEl);
    const badge = this.createBadgeElement(matchRes);

    const targetHeader =
      document.querySelector('.header-actions') ||
      document.querySelector('.mod-actions') ||
      nameEl.parentElement;

    if (targetHeader && !targetHeader.querySelector('.nxdt-inventory-badge')) {
      targetHeader.appendChild(badge);
    }
  }

  /**
   * Annotates mod cards on search, browse, and category pages.
   */
  async annotateModCards(root = document) {
    if (!this.inventory) await this.loadInventory();

    const cards = root.querySelectorAll(
      '.mod-tile, .card, .mod-item, [data-mod-id], .table-browse tr, .mod-search-result'
    );

    for (const card of cards) {
      if (this.annotatedElements.has(card)) continue;
      this.annotatedElements.add(card);

      const link = card.querySelector('a[href*="/mods/"]');
      if (!link) continue;

      const modIdMatch = link.href.match(/\/mods\/(\d+)/i);
      const modId = modIdMatch ? modIdMatch[1] : null;
      const titleEl = card.querySelector('.mod-name, .title, h3, h4, a[href*="/mods/"]') || link;
      const modName = titleEl.textContent.trim();

      const matchRes = await sendMessage({
        type: MESSAGE_TYPES.CHECK_MOD_INVENTORY,
        payload: {
          gameDomain: this.gameDomain,
          modId,
          modName,
        },
      });

      if (matchRes && matchRes.isInstalled) {
        const badge = this.createBadgeElement(matchRes, true);
        const badgeContainer =
          card.querySelector('.tags, .meta, .card-header, .actions') || card;
        if (!card.querySelector('.nxdt-inventory-badge')) {
          badgeContainer.appendChild(badge);
        }
      }
    }
  }

  createBadgeElement(match, isCompact = false) {
    const badge = document.createElement('span');
    badge.className = `nxdt-inventory-badge ${isCompact ? 'nxdt-badge-compact' : ''}`;

    if (match.isInstalled) {
      if (match.updateAvailable) {
        badge.classList.add('nxdt-badge-update');
        badge.innerHTML = `<b>Update Available</b> ${
          match.installedVersion ? `(Installed v${match.installedVersion})` : ''
        }`;
        badge.title = 'You have an older version of this mod in your local load order.';
      } else {
        badge.classList.add('nxdt-badge-installed');
        badge.innerHTML = `<b>Installed</b> ${
          match.installedVersion ? `v${match.installedVersion}` : ''
        }`;
        badge.title = 'This mod is installed in your local mod manager.';
      }
    } else {
      badge.classList.add('nxdt-badge-not-installed');
      badge.innerHTML = `<b>Not Installed</b>`;
      badge.title = 'Not detected in your local mod manager inventory.';
    }

    return badge;
  }

  async run() {
    await this.loadInventory();
    await this.annotateModHeader();
    await this.annotateModCards();
  }
}
