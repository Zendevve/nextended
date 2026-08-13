import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CollectionManager,
  CollectionProgressBar,
  CollectionSelectModal,
  CollectionUpdateModal,
} from '../src/content/collection-ui.js';
import { MESSAGE_TYPES } from '../src/shared/constants.js';

const ok = (result) => ({ success: true, result });
const fail = (error, code) => ({ success: false, error, code });

/** Drains promise microtasks until `condition` holds (each await advances the chain one step). */
async function flushUntil(condition, attempts = 50) {
  for (let i = 0; i < attempts; i++) {
    if (condition()) return;
    await Promise.resolve();
  }
  throw new Error('flushUntil: condition not met within the attempt budget');
}

/**
 * Replaces chrome.runtime.sendMessage with a vi.fn that supports the
 * callback style used by collection-ui.js AND returns a promise, resolving
 * both with the handler's response. Handlers may return a promise (useful
 * for gating a message in flight).
 */
function mockSendMessage(handler) {
  const sendMessage = vi.fn((msg, cb) => {
    const res = handler(msg);
    if (res && typeof res.then === 'function') {
      return res.then((r) => {
        if (cb) cb(r);
        return r;
      });
    }
    if (cb) cb(res);
    return Promise.resolve(res);
  });
  chrome.runtime.sendMessage = sendMessage;
  return sendMessage;
}

function makeMod(fileId, name) {
  return {
    fileId,
    optional: false,
    file: {
      fileId,
      name,
      size: 1024,
      mod: { name, game: { domainName: 'skyrimspecialedition', id: 1704 } },
    },
  };
}

function createManager(gameDomain = 'skyrimspecialedition', collectionSlug = 'mycollection') {
  const manager = new CollectionManager(gameDomain, collectionSlug);
  manager.downloadButton.render();
  return manager;
}

const defaultResponses = {
  [MESSAGE_TYPES.GET_COLLECTION_HISTORY]: ok({ history: {} }),
  [MESSAGE_TYPES.RESOLVE_COLLECTION_DOWNLOAD]: ok({
    url: 'https://files.nexus-cdn.com/mod.7z',
    fileId: '100',
  }),
  [MESSAGE_TYPES.START_DOWNLOAD]: ok({ ok: true }),
  [MESSAGE_TYPES.SET_COLLECTION_HISTORY]: ok({ ok: true }),
};

describe('CollectionManager download queue', () => {
  beforeEach(() => {
    window.confirm = vi.fn(() => true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('ignores a second downloadMods call while a run is active (mutex)', async () => {
    let releaseStart;
    const startGate = new Promise((resolve) => {
      releaseStart = resolve;
    });
    const send = mockSendMessage((msg) => {
      if (msg.type === MESSAGE_TYPES.START_DOWNLOAD) return startGate;
      return defaultResponses[msg.type] ?? ok({});
    });

    const manager = createManager();
    const mod = makeMod(100, 'Test Mod');

    const firstRun = manager.downloadMods([mod], 'all');

    // mutex flag and radio lock are applied synchronously before any await
    expect(manager.isRunning).toBe(true);
    const radios = manager.downloadButton.element.querySelectorAll('input[name="nxdtMethod"]');
    expect(radios.length).toBeGreaterThan(0);
    radios.forEach((rb) => expect(rb.disabled).toBe(true));

    // the run issued its history fetch before its first await
    expect(
      send.mock.calls.filter(([m]) => m.type === MESSAGE_TYPES.GET_COLLECTION_HISTORY)
    ).toHaveLength(1);

    const callsBefore = send.mock.calls.length;

    // second invocation is ignored: no new messages, the first run keeps ownership
    const secondRun = manager.downloadMods([mod], 'all');
    expect(manager.isRunning).toBe(true);
    expect(send.mock.calls.length).toBe(callsBefore);
    await secondRun;

    // let the first run finish
    releaseStart(ok({ ok: true }));
    await firstRun;

    expect(manager.isRunning).toBe(false);
    radios.forEach((rb) => expect(rb.disabled).toBe(false));
  });

  it('abort() mid-pause stops the loop, clears the pause timer and restores the button', async () => {
    vi.useFakeTimers();
    const send = mockSendMessage((msg) => defaultResponses[msg.type] ?? ok({}));

    const manager = createManager();
    const run = manager.downloadMods([makeMod(100, 'Mod A'), makeMod(200, 'Mod B')], 'all');

    // first mod is done; the loop is now waiting out the inter-download pause
    await flushUntil(() => manager.pauseTimer !== null);
    expect(manager.pauseTimer).not.toBeNull();

    manager.abort();

    await run;

    expect(manager.isRunning).toBe(false);
    expect(manager.aborted).toBe(true);
    expect(manager.pauseTimer).toBeNull();
    expect(manager.progressBar.status).toBe(CollectionProgressBar.STATUS_STOPPED);
    expect(manager.progressBar.element.style.display).toBe('none');
    expect(manager.downloadButton.element.style.display).toBe('flex');
    // the second mod was never resolved/started
    expect(
      send.mock.calls.filter(([m]) => m.type === MESSAGE_TYPES.RESOLVE_COLLECTION_DOWNLOAD)
    ).toHaveLength(1);
  });

  it('updateHistory sends a single SET_COLLECTION_HISTORY message with the new payload shape', async () => {
    const send = mockSendMessage((msg) => defaultResponses[msg.type] ?? ok({}));

    const manager = createManager('skyrimspecialedition', 'cool-collection');
    await manager.updateHistory('mandatory', '42');

    const setCalls = send.mock.calls.filter(
      ([m]) => m.type === MESSAGE_TYPES.SET_COLLECTION_HISTORY
    );
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0][0].payload).toEqual({
      gameDomain: 'skyrimspecialedition',
      collectionSlug: 'cool-collection',
      type: 'mandatory',
      fileIds: ['42'],
    });
    // no GET-then-SET round trip anymore
    expect(
      send.mock.calls.filter(([m]) => m.type === MESSAGE_TYPES.GET_COLLECTION_HISTORY)
    ).toHaveLength(0);
  });

  it('clears history with replace:true when the user cancels the skip dialog', async () => {
    const send = mockSendMessage((msg) => defaultResponses[msg.type] ?? ok({}));
    const manager = createManager('skyrimspecialedition', 'cool-collection');
    window.confirm = vi.fn(() => false);
    manager.getHistory = async () => ({
      skyrimspecialedition: { 'cool-collection': { all: ['999'] } },
    });

    await manager.downloadMods([makeMod(100, 'Mod A')], 'all');

    const clearCall = send.mock.calls.find(
      ([m]) =>
        m.type === MESSAGE_TYPES.SET_COLLECTION_HISTORY &&
        Array.isArray(m.payload?.fileIds) &&
        m.payload.fileIds.length === 0
    );
    expect(clearCall).toBeTruthy();
    expect(clearCall[0].payload).toEqual({
      gameDomain: 'skyrimspecialedition',
      collectionSlug: 'cool-collection',
      type: 'all',
      fileIds: [],
      replace: true,
    });
  });

  it('sends COLLECTION_FINISHED after a successful full run', async () => {
    const send = mockSendMessage((msg) => defaultResponses[msg.type] ?? ok({}));

    const manager = createManager();
    await manager.downloadMods([makeMod(100, 'Mod A')], 'all');

    const finished = send.mock.calls.filter(
      ([m]) => m.type === MESSAGE_TYPES.COLLECTION_FINISHED
    );
    expect(finished).toHaveLength(1);
    expect(finished[0][0].payload).toEqual({});
  });

  it('does not send COLLECTION_FINISHED after abort()', async () => {
    vi.useFakeTimers();
    const send = mockSendMessage((msg) => defaultResponses[msg.type] ?? ok({}));

    const manager = createManager();
    const run = manager.downloadMods([makeMod(100, 'Mod A'), makeMod(200, 'Mod B')], 'all');

    await flushUntil(() => manager.pauseTimer !== null);
    manager.abort();
    await run;

    expect(
      send.mock.calls.filter(([m]) => m.type === MESSAGE_TYPES.COLLECTION_FINISHED)
    ).toHaveLength(0);
  });

  it('treats START_DOWNLOAD rejection as a failed download and continues the queue', async () => {
    // The SW startDownload handler RESOLVES failures as {success:false,...}
    // (it never throws), so the real envelope is
    // {success:true, result:{success:false,error,code}} and the sendMessage
    // wrapper resolves result — downloadMods must see res.success === false.
    const send = mockSendMessage((msg) => {
      if (msg.type === MESSAGE_TYPES.START_DOWNLOAD) {
        return ok({ success: false, error: 'Download rejected by the browser', code: 'UNKNOWN' });
      }
      return defaultResponses[msg.type] ?? ok({});
    });

    const manager = createManager();
    await manager.downloadMods([makeMod(100, 'Mod A'), makeMod(200, 'Mod B')], 'all');

    // both mods were attempted: the queue did not abort after the first failure
    expect(
      send.mock.calls.filter(([m]) => m.type === MESSAGE_TYPES.RESOLVE_COLLECTION_DOWNLOAD)
    ).toHaveLength(2);
    // failed downloads are never recorded in history
    expect(
      send.mock.calls.filter(([m]) => m.type === MESSAGE_TYPES.SET_COLLECTION_HISTORY)
    ).toHaveLength(0);

    const logText = manager.console.output.textContent;
    expect(logText).toContain('Download failed');
    expect(logText.match(/Download failed/g)).toHaveLength(2);

    // the run still ended cleanly
    expect(manager.isRunning).toBe(false);
    expect(manager.progressBar.status).toBe(CollectionProgressBar.STATUS_FINISHED);
  });

  it('renders GraphQL error text as plain text, not HTML (no XSS)', async () => {
    const evil = '<img src=x onerror="window.__pwned=1">';
    mockSendMessage((msg) => {
      if (msg.type === MESSAGE_TYPES.FETCH_COLLECTION_MODS) {
        return fail(`GraphQL error: ${evil}`, 'NETWORK_ERROR');
      }
      return ok({});
    });

    const manager = createManager();
    await manager.init();

    expect(manager.element.querySelectorAll('img')).toHaveLength(0);
    expect(manager.element.querySelector('[onerror]')).toBeNull();
    expect(manager.element.textContent).toContain('Failed to load collection data: GraphQL error:');
    expect(window.__pwned).toBeUndefined();
  });

  it('includes modId in the RESOLVE_COLLECTION_DOWNLOAD payload', async () => {
    const send = mockSendMessage((msg) => defaultResponses[msg.type] ?? ok({}));
    const manager = createManager();
    const mod = makeMod(100, 'Test Mod');
    mod.file.mod.modId = 456;

    await manager.downloadMods([mod], 'all');

    const resolveCalls = send.mock.calls.filter(
      ([m]) => m.type === MESSAGE_TYPES.RESOLVE_COLLECTION_DOWNLOAD
    );
    expect(resolveCalls).toHaveLength(1);
    expect(resolveCalls[0][0].payload).toMatchObject({
      fileId: '100',
      gameId: '1704',
      gameDomain: 'skyrimspecialedition',
      isNMM: true,
      modId: 456,
    });
  });
});

describe('CollectionSelectModal', () => {
  it('renders a mod name containing HTML as plain text (no elements injected)', () => {
    const evilName = '<img src=x onerror="document.body.dataset.pwned=1">';
    const manager = createManager();
    manager.mods = {
      all: [{ fileId: 7, optional: false, file: { name: evilName, size: 100, mod: { name: 'Evil Mod' } } }],
      mandatory: [],
      optional: [],
    };

    const modal = new CollectionSelectModal(manager);
    document.body.appendChild(modal.element);
    modal.render();

    expect(modal.element.getAttribute('data-nxdt-modal')).toBe('true');

    const list = modal.element.querySelector('#nxdtModList');
    expect(list.querySelectorAll('img')).toHaveLength(0);
    expect(list.querySelector('[onerror]')).toBeNull();
    const title = list.querySelector('.nxdt-modal-row-title');
    expect(title).not.toBeNull();
    expect(title.textContent).toBe(evilName);
    expect(document.body.dataset.pwned).toBeUndefined();
  });

  it('preserves checkbox selection across a search-triggered re-render', () => {
    const manager = createManager();
    manager.mods = {
      all: [
        { fileId: 1, optional: false, file: { name: 'Mod One', size: 100, mod: { name: 'Mod One' } } },
        { fileId: 2, optional: true, file: { name: 'Mod Two', size: 200, mod: { name: 'Mod Two' } } },
      ],
      mandatory: [],
      optional: [],
    };

    const modal = new CollectionSelectModal(manager);
    document.body.appendChild(modal.element);
    modal.render();

    const list = modal.element.querySelector('#nxdtModList');
    const search = modal.element.querySelector('#nxdtSearch');
    const countBadge = modal.element.querySelector('#nxdtSelCount');

    const first = list.querySelectorAll('input[type="checkbox"]')[0];
    first.checked = true;
    first.dispatchEvent(new Event('change', { bubbles: true }));
    expect(countBadge.textContent).toBe('1 selected');

    // a search that hides the checked mod rebuilds the list...
    search.value = 'Two';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    expect(list.querySelectorAll('.nxdt-modal-row')).toHaveLength(1);
    expect(countBadge.textContent).toBe('1 selected');

    // ...and clearing it brings the selection back
    search.value = '';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    const boxes = list.querySelectorAll('input[type="checkbox"]');
    expect(boxes).toHaveLength(2);
    expect(boxes[0].checked).toBe(true);
    expect(boxes[1].checked).toBe(false);
    expect(countBadge.textContent).toBe('1 selected');
  });
});

describe('CollectionUpdateModal', () => {
  it('renders diff entries with HTML in names as plain text', async () => {
    const evilName = '<img src=x onerror="document.body.dataset.pwned=1">';
    mockSendMessage((msg) => {
      switch (msg.type) {
        case MESSAGE_TYPES.FETCH_COLLECTION_REVISIONS:
          return ok({
            revisions: [
              { revisionNumber: 1, totalSize: 1048576 },
              { revisionNumber: 2, totalSize: 2097152 },
            ],
          });
        case MESSAGE_TYPES.FETCH_COLLECTION_MODS:
          return ok({
            collectionRevision: {
              modFiles:
                msg.payload.revision === 1
                  ? [{ fileId: 1, file: { name: 'Old Mod', mod: {} } }]
                  : [
                      { fileId: 1, file: { name: 'Old Mod', mod: {} } },
                      { fileId: 2, file: { name: evilName, mod: {} } },
                    ],
            },
          });
        default:
          return ok({});
      }
    });

    const manager = createManager();
    const modal = new CollectionUpdateModal(manager);
    document.body.appendChild(modal.element);
    await modal.render();

    expect(modal.element.getAttribute('data-nxdt-modal')).toBe('true');

    const from = modal.element.querySelector('#nxdtRevFrom');
    const to = modal.element.querySelector('#nxdtRevTo');
    from.value = '1';
    to.value = '2';
    to.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();

    const output = modal.element.querySelector('#nxdtDiffOutput');
    expect(output.querySelectorAll('img')).toHaveLength(0);
    expect(output.querySelector('[onerror]')).toBeNull();
    expect(output.textContent).toContain(evilName);
    expect(document.body.dataset.pwned).toBeUndefined();
  });
});
