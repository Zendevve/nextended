import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MESSAGE_TYPES, STORAGE_KEY_SETTINGS } from '../src/shared/constants.js';

const html = readFileSync(join(process.cwd(), 'src', 'popup', 'popup.html'), 'utf8');
const bodyHtml = (html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html).replace(
  /<script\b[^>]*>[\s\S]*?<\/script>/gi,
  ''
);

const COLLECTION_URL =
  'https://www.nexusmods.com/games/skyrimspecialedition/collections/my-collection/';

function buildChromeMock(options = {}) {
  const {
    tab = { id: 7, url: COLLECTION_URL },
    settings = { enabled: true, handleCollections: true, autoStartDownload: true, handleArchivedFiles: true },
    storedSettings = settings,
    stats = { collectionsDownloaded: 7, autoDownloadsCompleted: 3 },
    alive = true,
  } = options;

  const runtime = {
    id: 'test-popup-id',
    sendMessage: vi.fn((msg, cb) => {
      if (msg.type === MESSAGE_TYPES.PING) {
        cb && cb({ success: alive });
      } else if (msg.type === MESSAGE_TYPES.GET_SETTINGS) {
        cb && cb({ success: true, result: { settings: storedSettings } });
      } else {
        cb && cb({ success: true });
      }
    }),
    openOptionsPage: vi.fn(),
  };

  const storage = {
    local: {
      get: vi.fn((keys, cb) => {
        const out = {};
        const keyStr = typeof keys === 'string' ? keys : Array.isArray(keys) ? keys[0] : Object.keys(keys)[0];
        if (keyStr === STORAGE_KEY_SETTINGS) out[STORAGE_KEY_SETTINGS] = storedSettings;
        if (keyStr === 'stats') out.stats = stats;
        if (Array.isArray(keys)) {
          for (const k of keys) {
            if (k === STORAGE_KEY_SETTINGS) out[k] = storedSettings;
            if (k === 'stats') out[k] = stats;
          }
        }
        if (typeof cb === 'function') cb(out);
        return Promise.resolve(out);
      }),
      set: vi.fn((items, cb) => {
        Object.assign(storedSettings, items[STORAGE_KEY_SETTINGS] || {});
        if (typeof cb === 'function') cb();
        return Promise.resolve();
      }),
    },
    onChanged: {
      addListener: vi.fn(),
    },
  };

  const tabs = {
    query: vi.fn((_query, cb) => cb && cb([tab].filter(Boolean))),
    sendMessage: vi.fn((_tabId, _msg, cb) => cb && cb({ ok: true })),
    update: vi.fn(),
    create: vi.fn(),
  };

  return { runtime, storage, tabs };
}

let chromeMock;
let closeSpy;

async function loadPopup(options = {}) {
  document.body.innerHTML = bodyHtml;
  vi.resetModules();

  closeSpy = vi.fn();
  try {
    Object.defineProperty(window, 'close', { configurable: true, value: closeSpy });
  } catch {
    window.close = closeSpy;
  }

  chromeMock = buildChromeMock(options);
  globalThis.chrome = chromeMock;

  const popup = await import('../src/popup/popup.js');
  await popup.refresh();
  return popup;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('popup', () => {
  it('renders every row as an actionable button with a label and chevron', async () => {
    await loadPopup();

    const rows = [
      ['site-name', 'Current site'],
      ['collection-state', 'Collection Downloader'],
      ['nowait-state', 'Countdown Skip'],
      ['archived-state', 'Archived Files'],
    ];
    for (const [valueId, label] of rows) {
      const valueEl = document.getElementById(valueId);
      const button = valueEl.closest('button');
      expect(button).not.toBeNull();
      expect(button.type).toBe('button');
      expect(button.textContent).toContain(label);
    }
    expect(document.querySelectorAll('.chevron').length).toBe(4);
    expect(document.querySelector('h1').textContent).toBe('Nexus Download Tools');
    expect(document.getElementById('status-dot')).not.toBeNull();
  });

  it('shows "Collection" for a collection URL', async () => {
    await loadPopup({ tab: { id: 7, url: COLLECTION_URL } });
    expect(document.getElementById('site-name').textContent).toBe('Collection');
  });

  it('shows "Mod Page" for a mod URL', async () => {
    await loadPopup({ tab: { id: 7, url: 'https://www.nexusmods.com/skyrimspecialedition/mods/4321' } });
    expect(document.getElementById('site-name').textContent).toBe('Mod Page');
  });

  it('shows "On Nexus Mods" for any other nexusmods.com URL', async () => {
    await loadPopup({ tab: { id: 7, url: 'https://www.nexusmods.com/' } });
    expect(document.getElementById('site-name').textContent).toBe('On Nexus Mods');
  });

  it('shows "Not on Nexus" for a non-Nexus URL', async () => {
    await loadPopup({ tab: { id: 7, url: 'https://example.com/whatever' } });
    expect(document.getElementById('site-name').textContent).toBe('Not on Nexus');
  });

  it('shows "Not on Nexus" when there is no active tab', async () => {
    await loadPopup({ tab: null });
    expect(document.getElementById('site-name').textContent).toBe('Not on Nexus');
  });

  it('toggles autoStartDownload with read-merge-write and updates the label', async () => {
    const settings = { enabled: true, autoStartDownload: false, handleArchivedFiles: true, handleCollections: true };
    await loadPopup({ settings, storedSettings: settings });
    expect(document.getElementById('nowait-state').textContent).toBe('Off');

    document.getElementById('nowait-row').click();

    await vi.waitFor(() => {
      expect(chromeMock.storage.local.set).toHaveBeenCalled();
    });
    await vi.waitFor(() => {
      expect(document.getElementById('nowait-state').textContent).toBe('On');
    });
  });

  it('shows "Off" for the collection row when handleCollections is disabled', async () => {
    await loadPopup({
      settings: { enabled: true, handleCollections: false, autoStartDownload: true, handleArchivedFiles: true },
    });
    expect(document.getElementById('collection-state').textContent).toBe('Off');
  });

  it('shows "Off" for archived row when handleArchivedFiles is disabled', async () => {
    await loadPopup({
      settings: { enabled: true, handleCollections: true, autoStartDownload: true, handleArchivedFiles: false },
    });
    expect(document.getElementById('archived-state').textContent).toBe('Off');
  });

  it('shows a gray status dot when the extension is disabled', async () => {
    await loadPopup({ settings: { enabled: false, handleCollections: true, autoStartDownload: true, handleArchivedFiles: true } });
    expect(document.getElementById('status-dot').classList.contains('inactive')).toBe(true);
  });

  it('shows a green status dot when the service worker is alive and enabled', async () => {
    await loadPopup();
    expect(document.getElementById('status-dot').classList.contains('inactive')).toBe(false);
  });

  it('populates the collections count from stats', async () => {
    await loadPopup({ stats: { collectionsDownloaded: 42, autoDownloadsCompleted: 9 } });
    expect(document.getElementById('collections-count').textContent).toBe('42');
    expect(document.getElementById('autodl-count').textContent).toBe('9');
  });

  it('opens the options page from the Settings button', async () => {
    await loadPopup();
    document.getElementById('open-settings').click();
    expect(chromeMock.runtime.openOptionsPage).toHaveBeenCalledTimes(1);
  });

  it('renders the donate button in the DOM', async () => {
    await loadPopup();
    const donateBtn = document.getElementById('open-donate');
    expect(donateBtn).not.toBeNull();
    expect(donateBtn.classList.contains('btn-donate')).toBe(true);
    expect(donateBtn.textContent).toContain('Buy Me a Coffee');
  });

  it('opens the Buy Me a Coffee link when clicking the donate button', async () => {
    await loadPopup();
    const donateBtn = document.getElementById('open-donate');
    donateBtn.click();
    expect(chromeMock.tabs.create).toHaveBeenCalledTimes(1);
    expect(chromeMock.tabs.create).toHaveBeenCalledWith({
      url: 'https://buymeacoffee.com/zendevve',
    });
  });

  it('falls back to window.open when chrome.tabs.create is unavailable', async () => {
    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    await loadPopup();
    delete globalThis.chrome.tabs.create;
    const donateBtn = document.getElementById('open-donate');
    donateBtn.click();
    expect(windowOpenSpy).toHaveBeenCalledWith(
      'https://buymeacoffee.com/zendevve',
      '_blank',
      'noopener,noreferrer'
    );
    windowOpenSpy.mockRestore();
  });
});
