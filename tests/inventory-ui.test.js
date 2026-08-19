import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { InventoryAnnotator } from '../src/content/inventory-sync.js';
import { CompatibilityRadar } from '../src/content/compatibility-radar.js';
import { MESSAGE_TYPES } from '../src/shared/constants.js';

describe('Inventory & Compatibility UI', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('injects installed badge into mod header', async () => {
    document.body.innerHTML = `
      <div class="header-actions">
        <h1>SkyUI</h1>
      </div>
    `;

    // Mock chrome.runtime.sendMessage
    globalThis.chrome = {
      runtime: {
        lastError: null,
        sendMessage: vi.fn((msg, cb) => {
          if (msg.type === MESSAGE_TYPES.GET_INVENTORY) {
            cb({
              result: {
                inventory: {
                  games: {
                    skyrimspecialedition: {
                      mods: { '1234': { name: 'SkyUI', version: '5.2' } },
                    },
                  },
                },
              },
            });
          } else if (msg.type === MESSAGE_TYPES.CHECK_MOD_INVENTORY) {
            cb({
              result: {
                isInstalled: true,
                installedVersion: '5.2',
                updateAvailable: false,
              },
            });
          }
        }),
      },
    };

    // Simulate location
    Object.defineProperty(window, 'location', {
      value: { pathname: '/skyrimspecialedition/mods/1234' },
      writable: true,
    });

    const annotator = new InventoryAnnotator();
    await annotator.annotateModHeader();

    const badge = document.querySelector('.nxdt-inventory-badge');
    expect(badge).not.toBeNull();
    expect(badge.classList.contains('nxdt-badge-installed')).toBe(true);
    expect(badge.textContent).toContain('Installed');
    expect(badge.textContent).toContain('v5.2');
  });

  it('renders CompatibilityRadar card on mod pages', async () => {
    document.body.innerHTML = `
      <div class="mod-details-info">
        <h1>SkyUI</h1>
        <div class="mod-description">Compatible with game 1.6.1170</div>
        <a href="?tab=bugs">Bugs (2)</a>
      </div>
    `;

    globalThis.chrome = {
      runtime: {
        lastError: null,
        sendMessage: vi.fn((msg, cb) => {
          if (msg.type === MESSAGE_TYPES.GET_MOD_HEALTH_RADAR) {
            cb({
              result: {
                healthScore: 95,
                status: 'healthy',
                badges: [
                  { label: 'Game 1.6.1170', type: 'version' },
                  { label: 'Installed v5.2', type: 'installed' },
                ],
                warnings: [],
              },
            });
          }
        }),
      },
    };

    Object.defineProperty(window, 'location', {
      value: { pathname: '/skyrimspecialedition/mods/1234' },
      writable: true,
    });

    const radar = new CompatibilityRadar();
    await radar.renderRadar();

    const radarEl = document.querySelector('.nxdt-compatibility-radar');
    expect(radarEl).not.toBeNull();
    expect(radarEl.textContent).toContain('Compatibility & Mod Health Radar');
    expect(radarEl.textContent).toContain('95% Health');
    expect(radarEl.textContent).toContain('Game 1.6.1170');
  });
});
