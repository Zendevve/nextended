import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isModPage,
  extractFileId,
  isNMMDownload,
  appendNmmParam,
  resolveAndStartDownload,
  archivedFileHandler,
  applyNoWaitFeatures,
  resetNoWaitState,
} from '../src/content/no-wait.js';

const MOD_PAGE = 'https://www.nexusmods.com/stardewvalley/mods/1234?tab=files';
const ARCHIVED_PAGE = 'https://www.nexusmods.com/stardewvalley/mods/1234?tab=files&category=archived';

beforeEach(() => {
  resetNoWaitState();
  window.happyDOM.setURL(MOD_PAGE);
});

describe('no-wait helpers', () => {
  it('detects mod pages correctly', () => {
    expect(isModPage({ pathname: '/stardewvalley/mods/1234' })).toBe(true);
    expect(isModPage({ pathname: '/skyrimspecialedition/mods/56789' })).toBe(true);
    expect(isModPage({ pathname: '/games/stardewvalley/collections/tckf0m' })).toBe(false);
  });

  it('extracts file id from various URL formats', () => {
    expect(extractFileId('https://www.nexusmods.com/stardewvalley/mods/1234?tab=files&file_id=9999')).toBe('9999');
    expect(extractFileId('https://www.nexusmods.com/stardewvalley/mods/1234/files/8888')).toBe('8888');
    expect(extractFileId('nxm://stardewvalley/mods/1234/files/7777?id=7777')).toBe('7777');
  });

  it('detects NMM / Vortex downloads', () => {
    expect(isNMMDownload(null, 'nxm://stardewvalley/mods/1234/files/7777')).toBe(true);
    expect(isNMMDownload(null, 'https://www.nexusmods.com/file?nmm=1')).toBe(true);
    expect(isNMMDownload(null, 'https://www.nexusmods.com/file?manual=1')).toBe(false);

    const btn = { textContent: 'Vortex Download', dataset: {} };
    expect(isNMMDownload(btn, '')).toBe(true);

    const btnManual = { textContent: 'Manual Download', dataset: {} };
    expect(isNMMDownload(btnManual, '')).toBe(false);
  });

  it('appends nmm parameter to URLs', () => {
    expect(appendNmmParam('https://www.nexusmods.com/file?id=123')).toBe('https://www.nexusmods.com/file?id=123&nmm=1');
    expect(appendNmmParam('https://www.nexusmods.com/file')).toBe('https://www.nexusmods.com/file?nmm=1');
    expect(appendNmmParam('https://www.nexusmods.com/file?nmm=1')).toBe('https://www.nexusmods.com/file?nmm=1');
  });
});

describe('archivedFileHandler', () => {
  it('appends download buttons without destroying existing box children', () => {
    window.happyDOM.setURL(ARCHIVED_PAGE);
    document.body.innerHTML = `
      <div class="row">
        <div class="file-expander-header" data-id="9999">Archived file</div>
        <div class="accordion-downloads">
          <span class="file-size">1.2 MB</span>
          <time>2024-01-01</time>
        </div>
      </div>
    `;

    archivedFileHandler({ handleArchivedFiles: true });

    const box = document.querySelector('.accordion-downloads');
    expect(box.querySelector('.file-size').textContent).toBe('1.2 MB');
    expect(box.querySelector('time')).not.toBeNull();

    const btns = box.querySelectorAll('[data-nxdt-archived-dl]');
    expect(btns).toHaveLength(2);
    expect(btns[0].querySelector('.flex-label').textContent).toBe('Mod manager download');
    expect(btns[1].querySelector('.flex-label').textContent).toBe('Manual download');
    expect(btns[0].href).toContain('file_id=9999&nmm=1');
    expect(btns[1].href).toContain('file_id=9999');
    expect(btns[1].href).not.toContain('nmm=1');
  });

  it('pairs each header with its own download box via shared ancestor', () => {
    window.happyDOM.setURL(ARCHIVED_PAGE);
    document.body.innerHTML = `
      <div class="row"><div class="file-expander-header" data-id="111">A</div><div class="accordion-downloads"><span class="size">1 MB</span></div></div>
      <div class="row"><div class="file-expander-header" data-id="222">B</div><div class="accordion-downloads"><span class="size">2 MB</span></div></div>
    `;

    archivedFileHandler({ handleArchivedFiles: true });

    const boxes = document.querySelectorAll('.accordion-downloads');
    expect(boxes).toHaveLength(2);
    expect(boxes[0].querySelector('[data-nxdt-archived-dl]').href).toContain('file_id=111');
    expect(boxes[1].querySelector('[data-nxdt-archived-dl]').href).toContain('file_id=222');
  });

  it('adds archive button to files tab footer without hiding its paragraph', () => {
    document.body.innerHTML = `
      <div id="files-tab-footer">
        <p>Showing all files</p>
      </div>
    `;

    archivedFileHandler({ handleArchivedFiles: true });

    const p = document.querySelector('#files-tab-footer p');
    expect(p.style.display).not.toBe('none');
    const btn = document.querySelector('[data-nxdt-archived-btn]');
    expect(btn).not.toBeNull();
    expect(btn.querySelector('.flex-label').textContent).toBe('File archive');
    expect(btn.href).toContain('category=archived');
  });

  it('is idempotent: running twice does not duplicate buttons', () => {
    window.happyDOM.setURL(ARCHIVED_PAGE);
    document.body.innerHTML = `
      <div class="row">
        <div class="file-expander-header" data-id="9999">Archived file</div>
        <div class="accordion-downloads"><span class="size">1 MB</span></div>
      </div>
    `;

    archivedFileHandler({ handleArchivedFiles: true });
    archivedFileHandler({ handleArchivedFiles: true });

    expect(document.querySelectorAll('[data-nxdt-archived-dl]')).toHaveLength(2);
  });
});

describe('resolveAndStartDownload', () => {
  it('resolves via chrome.runtime.sendMessage without any fetch', async () => {
    const sendMessage = vi.fn((message, cb) => {
      expect(message.type).toBe('NXDT_RESOLVE_ARCHIVED_DOWNLOAD');
      expect(message.payload).toEqual({
        fileId: '9999',
        slug: 'stardewvalley',
        modId: '1234',
        isNMM: false,
      });
      cb({ success: true, result: { url: 'https://files.nexus-cdn.com/some-file' } });
    });
    chrome.runtime.sendMessage = sendMessage;
    globalThis.fetch = vi.fn();
    const assignSpy = vi.spyOn(window.location, 'assign').mockImplementation(() => {});

    const ok = await resolveAndStartDownload('9999', false, MOD_PAGE);

    expect(ok).toBe(true);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(assignSpy).toHaveBeenCalledWith('https://files.nexus-cdn.com/some-file');
    assignSpy.mockRestore();
  });

  it('returns false and never navigates when resolution fails', async () => {
    chrome.runtime.sendMessage = vi.fn((message, cb) => {
      cb({ success: false, error: 'Boom', code: 'NETWORK_ERROR' });
    });
    globalThis.fetch = vi.fn();
    const assignSpy = vi.spyOn(window.location, 'assign').mockImplementation(() => {});

    const ok = await resolveAndStartDownload('9999', false, MOD_PAGE);

    expect(ok).toBe(false);
    expect(assignSpy).not.toHaveBeenCalled();
    assignSpy.mockRestore();
  });

  it('keeps local nxm:// construction for NMM downloads without messaging', async () => {
    const sendMessage = vi.fn();
    chrome.runtime.sendMessage = sendMessage;
    globalThis.fetch = vi.fn();
    const appendSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => {});

    const ok = await resolveAndStartDownload('9999', true, MOD_PAGE);

    expect(ok).toBe(true);
    expect(sendMessage).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    const iframe = appendSpy.mock.calls.map((c) => c[0]).find((n) => n && n.tagName === 'IFRAME');
    expect(iframe).toBeTruthy();
    expect(iframe.src).toBe('nxm://stardewvalley/mods/1234/files/9999');
    appendSpy.mockRestore();
  });
});

describe('applyNoWaitFeatures settings reactivity', () => {
  it('removes the requirements click listener when skipRequirements is off', () => {
    const addSpy = vi.spyOn(document.body, 'addEventListener');
    const removeSpy = vi.spyOn(document.body, 'removeEventListener');

    applyNoWaitFeatures({ skipRequirements: true });
    const added = addSpy.mock.calls.filter(
      ([type, , opts]) => type === 'click' && opts && opts.capture === true
    );
    expect(added).toHaveLength(1);
    const listener = added[0][1];

    applyNoWaitFeatures({ skipRequirements: false });
    const removed = removeSpy.mock.calls.filter(
      ([type, , opts]) => type === 'click' && opts && opts.capture === true
    );
    expect(removed).toHaveLength(1);
    expect(removed[0][1]).toBe(listener);

    // Synthetic click on a requirements link must not trigger any handler action.
    const replaceSpy = vi.spyOn(window.location, 'replace').mockImplementation(() => {});
    const link = document.createElement('a');
    link.href = 'https://www.nexusmods.com/stardewvalley/mods/1234?tab=requirements';
    document.body.appendChild(link);
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(replaceSpy).not.toHaveBeenCalled();
    replaceSpy.mockRestore();
  });

  it('removes archived buttons when disabled and re-injects when re-enabled', () => {
    window.happyDOM.setURL(ARCHIVED_PAGE);
    document.body.innerHTML = `
      <div class="row">
        <div class="file-expander-header" data-id="9999">Archived file</div>
        <div class="accordion-downloads"><span class="size">1 MB</span></div>
      </div>
    `;

    applyNoWaitFeatures({ handleArchivedFiles: true });
    expect(document.querySelectorAll('[data-nxdt-archived-dl]')).toHaveLength(2);

    applyNoWaitFeatures({ handleArchivedFiles: false });
    expect(document.querySelectorAll('[data-nxdt-archived-dl]')).toHaveLength(0);

    applyNoWaitFeatures({ handleArchivedFiles: true });
    expect(document.querySelectorAll('[data-nxdt-archived-dl]')).toHaveLength(2);
  });

  it('resetNoWaitState removes injected elements and clears auto-fire state', () => {
    window.happyDOM.setURL(ARCHIVED_PAGE);
    document.body.innerHTML = `
      <div class="row">
        <div class="file-expander-header" data-id="9999">Archived file</div>
        <div class="accordion-downloads"><span class="size">1 MB</span></div>
      </div>
    `;

    applyNoWaitFeatures({ handleArchivedFiles: true });
    expect(document.querySelectorAll('[data-nxdt-archived-dl]')).toHaveLength(2);

    resetNoWaitState();
    expect(document.querySelectorAll('[data-nxdt-archived-dl]')).toHaveLength(0);

    // Re-inject after reset works because WeakSet entries were cleared.
    applyNoWaitFeatures({ handleArchivedFiles: true });
    expect(document.querySelectorAll('[data-nxdt-archived-dl]')).toHaveLength(2);
  });
});
