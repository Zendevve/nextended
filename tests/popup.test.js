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
    settings = { enabled: true, handleCollections: true, autoStartDownload: true },
    storedSettings = settings,
    stats = { collectionsDownloaded: 7, autoDownloadsCompleted: 0 },
    alive = true,
  } = options;

  const runtime = {
    id: 'test-extension-id',
    onMessage: { addListener: vi.fn() },
    onInstalled: { addListener: vi.fn() },
    openOptionsPage: vi.fn(),
    sendMessage: vi.fn((message, cb) => {
      let response = { success: false, error: 'Unhandled message type in test mock' };
      if (message?.type === MESSAGE_TYPES.PING) {
        response = { success: true, result: { alive, stats } };
      } else if (message?.type === MESSAGE_TYPES.GET_SETTINGS) {
        response = { success: true, result: { settings } };
      }
      if (typeof cb === 'function') cb(response);
      return Promise.resolve(response);
    }),
  };

  const storage = {
    local: {
      get: vi.fn(() => Promise.resolve({ [STORAGE_KEY_SETTINGS]: storedSettings })),
      set: vi.fn(() => Promise.resolve()),
    },
    onChanged: { addListener: vi.fn() },
  };

  const tabs = {
    query: vi.fn((_query, cb) => cb && cb([tab])),
    sendMessage: vi.fn((_tabId, _msg, cb) => cb && cb({ ok: true })),
    update: vi.fn(),
    create: vi.fn(),
  };

  return { runtime, storage, tabs, ...options.extra };
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
    ];
    for (const [valueId, label] of rows) {
      const valueEl = document.getElementById(valueId);
      const button = valueEl.closest('button');
      expect(button).not.toBeNull();
      expect(button.type).toBe('button');
      expect(button.textContent).toContain(label);
    }
    expect(document.querySelectorAll('.chevron').length).toBe(3);
    expect(document.querySelector('h1').textContent).toBe('Nexus Download Tools');
    expect(document.getElementById('status-dot')).not.toBeNull();
  });

  it('shows "Collection page" for a collection URL', async () => {
    await loadPopup({ tab: { id: 7, url: COLLECTION_URL } });
    expect(document.getElementById('site-name').textContent).toBe('Collection page');
  });

  it('shows "Mod page" for a mod URL', async () => {
    await loadPopup({ tab: { id: 7, url: 'https://www.nexusmods.com/skyrimspecialedition/mods/4321' } });
    expect(document.getElementById('site-name').textContent).toBe('Mod page');
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

  it('sends FOCUS_COLLECTION_PANEL to the active collection tab and closes', async () => {
    await loadPopup();
    document.getElementById('collection-row').click();

    expect(chromeMock.tabs.sendMessage).toHaveBeenCalledWith(
      7,
      { type: MESSAGE_TYPES.FOCUS_COLLECTION_PANEL },
      expect.any(Function)
    );
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it('focuses the tab when the panel message reports ok:false', async () => {
    await loadPopup({
      extra: {
        tabs: {
          query: vi.fn((_query, cb) => cb && cb([{ id: 7, url: COLLECTION_URL }])),
          sendMessage: vi.fn((_tabId, _msg, cb) => cb && cb({ ok: false })),
          update: vi.fn(),
          create: vi.fn(),
        },
      },
    });
    document.getElementById('collection-row').click();

    expect(chromeMock.tabs.update).toHaveBeenCalledWith(7, { active: true });
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it('opens the collections page when the active tab is not a collection page', async () => {
    await loadPopup({ tab: { id: 7, url: 'https://www.nexusmods.com/skyrimspecialedition/mods/4321' } });
    document.getElementById('collection-row').click();

    expect(chromeMock.tabs.create).toHaveBeenCalledWith({ url: 'https://www.nexusmods.com/collections/' });
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it('focuses the active tab on site click when on a Nexus tab', async () => {
    await loadPopup();
    document.getElementById('site-row').click();

    expect(chromeMock.tabs.update).toHaveBeenCalledWith(7, { active: true });
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it('opens the Nexus homepage on site click when not on a Nexus tab', async () => {
    await loadPopup({ tab: { id: 7, url: 'https://example.com/whatever' } });
    document.getElementById('site-row').click();

    expect(chromeMock.tabs.create).toHaveBeenCalledWith({ url: 'https://www.nexusmods.com/' });
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it('toggles autoStartDownload with read-merge-write and updates the label', async () => {
    const settings = { enabled: true, autoStartDownload: false, skipRequirements: true };
    await loadPopup({ settings, storedSettings: settings });
    expect(document.getElementById('nowait-state').textContent).toBe('Off');

    document.getElementById('nowait-row').click();

    await vi.waitFor(() => {
      expect(chromeMock.storage.local.set).toHaveBeenCalled();
    });
    expect(chromeMock.storage.local.get).toHaveBeenCalledWith(STORAGE_KEY_SETTINGS);
    expect(chromeMock.storage.local.set).toHaveBeenCalledWith({
      [STORAGE_KEY_SETTINGS]: expect.objectContaining({
        autoStartDownload: true,
        skipRequirements: true,
        enabled: true,
      }),
    });
    expect(document.getElementById('nowait-state').textContent).toBe('On');
  });

  it('shows "Off" for the collection row when handleCollections is disabled', async () => {
    await loadPopup({
      settings: { enabled: true, handleCollections: false, autoStartDownload: true },
    });
    expect(document.getElementById('collection-state').textContent).toBe('Off');
  });

  it('shows a gray status dot when the extension is disabled', async () => {
    await loadPopup({ settings: { enabled: false, handleCollections: true, autoStartDownload: true } });
    expect(document.getElementById('status-dot').classList.contains('inactive')).toBe(true);
  });

  it('shows a green status dot when the service worker is alive and enabled', async () => {
    await loadPopup();
    expect(document.getElementById('status-dot').classList.contains('inactive')).toBe(false);
  });

  it('populates the collections count from PING stats', async () => {
    await loadPopup({ stats: { collectionsDownloaded: 42, autoDownloadsCompleted: 9 } });
    expect(document.getElementById('collections-count').textContent).toBe('42');
  });

  it('opens the options page from the Settings button', async () => {
    await loadPopup();
    document.getElementById('open-settings').click();
    expect(chromeMock.runtime.openOptionsPage).toHaveBeenCalledTimes(1);
  });
});
