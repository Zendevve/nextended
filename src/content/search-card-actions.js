import { MESSAGE_TYPES } from '../shared/constants.js';
import { createLogger } from '../shared/logger.js';

const log = createLogger('search-actions');

const handledCards = new WeakSet();

export class SearchCardActions {
  constructor() {
    this.active = true;
  }

  isBrowseOrSearchPage() {
    const p = window.location.pathname;
    return (
      p.includes('/mods') ||
      p.includes('/explore') ||
      p.includes('/search') ||
      p.includes('/categories')
    );
  }

  processCards() {
    if (!this.active || !this.isBrowseOrSearchPage()) return;

    const cards = document.querySelectorAll(
      '.mod-tile, .tile, .table-mods tbody tr, .search-result, [data-mod-id]'
    );

    cards.forEach((card) => {
      if (handledCards.has(card)) return;

      const link = card.querySelector('a[href*="/mods/"]');
      if (!link) return;

      const href = link.href;
      const match = href.match(/\/([^/]+)\/mods\/(\d+)/i);
      if (!match) return;

      const gameDomain = match[1];
      const modId = match[2];
      const title = (link.textContent || card.querySelector('.mod-name')?.textContent || 'Mod').trim();

      handledCards.add(card);
      this.injectQuickButtons(card, { gameDomain, modId, title, url: href });
    });
  }

  injectQuickButtons(card, modInfo) {
    if (card.querySelector('.nxdt-card-actions')) return;

    const actionsContainer = document.createElement('div');
    actionsContainer.className = 'nxdt-card-actions';

    const nxmBtn = document.createElement('a');
    nxmBtn.className = 'nxdt-card-btn nxdt-card-btn-nxm';
    nxmBtn.href = `${modInfo.url}?tab=files`;
    nxmBtn.title = 'Open files & auto-download';
    nxmBtn.textContent = '⬇ NXM';

    const queueBtn = document.createElement('button');
    queueBtn.type = 'button';
    queueBtn.className = 'nxdt-card-btn nxdt-card-btn-queue';
    queueBtn.title = 'Queue mod to background';
    queueBtn.textContent = '⚡ Queue';

    queueBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      try {
        await chrome.runtime.sendMessage({
          type: MESSAGE_TYPES.ENQUEUE_ITEMS,
          payload: {
            items: [
              {
                modId: modInfo.modId,
                gameDomain: modInfo.gameDomain,
                modName: modInfo.title,
                fileName: `${modInfo.title}.zip`,
                isNMM: true,
                sourceUrl: modInfo.url,
              },
            ],
          },
        });
        queueBtn.textContent = '✓ Queued';
        setTimeout(() => {
          queueBtn.textContent = '⚡ Queue';
        }, 1500);
      } catch (err) {
        log.warn('Failed to queue card mod', { error: err?.message });
      }
    });

    actionsContainer.appendChild(nxmBtn);
    actionsContainer.appendChild(queueBtn);

    const footer =
      card.querySelector('.tile-actions') ||
      card.querySelector('.actions') ||
      card.querySelector('td:last-child') ||
      card;

    footer.appendChild(actionsContainer);
  }
}
