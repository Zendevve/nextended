import { MESSAGE_TYPES } from '../shared/constants.js';
import { createLogger } from '../shared/logger.js';

const log = createLogger('compatibility-radar');

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

export class CompatibilityRadar {
  constructor() {
    this.injected = false;
  }

  isModPage() {
    return /\/mods\/\d+/i.test(window.location.pathname);
  }

  getModDetails() {
    const parts = window.location.pathname.split('/');
    const gameDomain = parts[1] || '';
    const modIdMatch = window.location.pathname.match(/\/mods\/(\d+)/);
    const modId = modIdMatch ? modIdMatch[1] : '';
    const nameEl = document.querySelector('h1') || document.querySelector('.mod-name');
    const modName = nameEl ? nameEl.textContent.trim() : 'Current Mod';

    // Parse bug count from tabs if available
    const bugsTab = document.querySelector('a[href*="tab=bugs"], a[href*="bugs"]');
    let bugCount = 0;
    if (bugsTab) {
      const countMatch = bugsTab.textContent.match(/\((\d+)\)/);
      if (countMatch) bugCount = parseInt(countMatch[1], 10);
    }

    const descText = document.querySelector('#description, .mod-description')?.textContent || '';
    const versionMatch = descText.match(/\b(1\.\d+(?:\.\d+)+)\b/);
    const targetGameVersion = versionMatch ? versionMatch[1] : null;

    return { gameDomain, modId, modName, bugCount, targetGameVersion };
  }

  async renderRadar() {
    if (!this.isModPage() || this.injected) return;
    if (document.querySelector('.nxdt-compatibility-radar')) return;

    const details = this.getModDetails();
    if (!details.modId) return;

    log.debug('Querying mod health radar', details);
    const radarData = await sendMessage({
      type: MESSAGE_TYPES.GET_MOD_HEALTH_RADAR,
      payload: details,
    });

    if (!radarData) return;
    this.injected = true;

    const card = document.createElement('div');
    card.className = `nxdt-compatibility-radar nxdt-radar-${radarData.status || 'healthy'}`;
    card.innerHTML = `
      <div class="nxdt-radar-header">
        <div class="nxdt-radar-title">
          <span class="nxdt-radar-icon">🎯</span>
          <span>Compatibility & Mod Health Radar</span>
        </div>
        <span class="nxdt-radar-score ${radarData.status || 'healthy'}">${radarData.healthScore}% Health</span>
      </div>
      <div class="nxdt-radar-body">
        <div class="nxdt-radar-badges">
          ${(radarData.badges || [])
            .map(
              (b) => `
            <span class="nxdt-radar-tag nxdt-tag-${b.type}">
              ${b.label}
            </span>
          `
            )
            .join('')}
        </div>
        ${
          radarData.warnings && radarData.warnings.length > 0
            ? `<div class="nxdt-radar-warnings">
                ${radarData.warnings.map((w) => `<div class="nxdt-radar-warn-item">⚠ ${w}</div>`).join('')}
              </div>`
            : ''
        }
      </div>
    `;

    const targetContainer =
      document.querySelector('.mod-details-info') ||
      document.querySelector('.side-details') ||
      document.querySelector('#section .files-tab') ||
      document.querySelector('.header-actions') ||
      document.querySelector('h1')?.parentElement;

    if (targetContainer) {
      targetContainer.appendChild(card);
    }
  }
}
