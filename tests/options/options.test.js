import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { STORAGE_KEY_SETTINGS } from '../../src/shared/constants.js';
import { DEFAULT_SETTINGS } from '../../src/storage/defaults.js';

const html = readFileSync(join(process.cwd(), 'src', 'options', 'options.html'), 'utf8');
const bodyHtml = (html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html).replace(
  /<script\b[^>]*>[\s\S]*?<\/script>/gi,
  ''
);

function buildChromeMock(initialSettings = {}) {
  let stored = { [STORAGE_KEY_SETTINGS]: { ...DEFAULT_SETTINGS, ...initialSettings } };

  const runtime = {
    id: 'test-options-id',
    sendMessage: vi.fn((_msg, cb) => cb && cb({ success: true })),
  };

  const storage = {
    local: {
      get: vi.fn((keys, cb) => {
        const out = {};
        if (typeof keys === 'string') {
          out[keys] = stored[keys];
        } else if (Array.isArray(keys)) {
          for (const k of keys) out[k] = stored[k];
        } else {
          Object.assign(out, stored);
        }
        if (typeof cb === 'function') cb(out);
        return Promise.resolve(out);
      }),
      set: vi.fn((items, cb) => {
        Object.assign(stored, items);
        if (typeof cb === 'function') cb();
        return Promise.resolve();
      }),
      remove: vi.fn((keys, cb) => {
        if (typeof keys === 'string') {
          delete stored[keys];
        } else if (Array.isArray(keys)) {
          for (const k of keys) delete stored[k];
        }
        if (typeof cb === 'function') cb();
        return Promise.resolve();
      }),
    },
  };

  return { runtime, storage, getStored: () => stored };
}

let chromeMock;

async function loadOptions(initialSettings = {}) {
  document.body.innerHTML = bodyHtml;
  vi.resetModules();

  chromeMock = buildChromeMock(initialSettings);
  globalThis.chrome = chromeMock;

  await import('../../src/options/options.js');
  document.dispatchEvent(new Event('DOMContentLoaded'));
  await new Promise((r) => setTimeout(r, 10));
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('options page', () => {
  it('populates initial form values from chrome.storage', async () => {
    await loadOptions({
      enabled: false,
      collectionPauseBetweenDownload: 7,
      collectionDownloadMethod: 1,
    });

    const enabledInput = document.querySelector('input[name="enabled"]');
    expect(enabledInput.checked).toBe(false);

    const pauseInput = document.querySelector('input[name="collectionPauseBetweenDownload"]');
    expect(pauseInput.value).toBe('7');

    const directMethodRadio = document.querySelector('input[name="collectionDownloadMethod"][value="1"]');
    expect(directMethodRadio.checked).toBe(true);
  });

  it('switches sections when category tabs are clicked', async () => {
    await loadOptions();

    const tabGeneral = document.getElementById('tab-general');
    const tabCollections = document.getElementById('tab-collections');
    const secGeneral = document.getElementById('section-general');
    const secCollections = document.getElementById('section-collections');

    tabCollections.click();
    expect(tabCollections.classList.contains('active')).toBe(true);
    expect(tabCollections.getAttribute('aria-selected')).toBe('true');
    expect(secCollections.style.display).not.toBe('none');
    expect(secGeneral.style.display).toBe('none');

    tabGeneral.click();
    expect(tabGeneral.classList.contains('active')).toBe(true);
    expect(secGeneral.style.display).not.toBe('none');
    expect(secCollections.style.display).toBe('none');
  });

  it('navigates category tabs using keyboard arrow keys', async () => {
    await loadOptions();

    const tabAll = document.getElementById('tab-all');
    const tabGeneral = document.getElementById('tab-general');

    tabAll.focus();
    tabAll.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

    expect(tabGeneral.classList.contains('active')).toBe(true);
    expect(tabGeneral.getAttribute('aria-selected')).toBe('true');
  });

  it('applies preset profile when preset button is clicked and shows visual feedback', async () => {
    await loadOptions();

    const soloModderBtn = document.querySelector('.preset-btn[data-preset="solo_modder"]');
    soloModderBtn.click();

    await new Promise((r) => setTimeout(r, 20));

    const stored = chromeMock.getStored()[STORAGE_KEY_SETTINGS];
    expect(stored.skipRequirements).toBe(true);
    expect(stored.autoCloseTab).toBe(true);

    const toast = document.getElementById('toast');
    expect(toast.textContent).toContain('Applied preset');
  });

  it('persists changes and triggers toast on save button click', async () => {
    await loadOptions();

    const skipReq = document.querySelector('input[name="skipRequirements"]');
    skipReq.checked = false;

    const saveBtn = document.getElementById('save-btn');
    saveBtn.click();

    await new Promise((r) => setTimeout(r, 10));

    expect(chromeMock.storage.local.set).toHaveBeenCalled();

    const toast = document.getElementById('toast');
    expect(toast.textContent).toContain('Settings saved');
  });

  it('resets settings to defaults on reset button click', async () => {
    await loadOptions({ enabled: false });

    const resetBtn = document.getElementById('reset-btn');
    resetBtn.click();

    await new Promise((r) => setTimeout(r, 20));

    expect(chromeMock.storage.local.set).toHaveBeenCalled();
    const stored = chromeMock.getStored()[STORAGE_KEY_SETTINGS];
    expect(stored.enabled).toBe(true);

    const toast = document.getElementById('toast');
    expect(toast.textContent).toContain('Reset');
  });

  it('filters controls matching search input in real time', async () => {
    await loadOptions();

    const searchInput = document.getElementById('settings-search');
    searchInput.value = 'timeout';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));

    const secAdvanced = document.getElementById('section-advanced');
    const secGeneral = document.getElementById('section-general');

    expect(secAdvanced.style.display).not.toBe('none');
    expect(secGeneral.style.display).toBe('none');

    searchInput.value = '';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));

    expect(secGeneral.style.display).not.toBe('none');
  });

  it('renders Buy Me a Coffee donation links with the correct URL and attributes', async () => {
    await loadOptions();

    const DONATION_URL = 'https://buymeacoffee.com/zendevve';

    const headerDonateBtn = document.querySelector('.header-donate-btn');
    expect(headerDonateBtn).not.toBeNull();
    expect(headerDonateBtn.getAttribute('href')).toBe(DONATION_URL);
    expect(headerDonateBtn.getAttribute('target')).toBe('_blank');

    const footerDonateBtn = document.querySelector('.btn-coffee-footer');
    expect(footerDonateBtn.getAttribute('href')).toBe(DONATION_URL);
  });
});
