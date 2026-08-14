import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueueManager } from '../../src/background/queue-manager.js';
import { QUEUE_STATUS, ITEM_STATUS } from '../../src/shared/constants.js';

function makeStorage() {
  const data = {};
  return {
    local: {
      get: vi.fn((key) => {
        if (typeof key === 'string') return Promise.resolve({ [key]: data[key] });
        const out = {};
        for (const k of key) out[k] = data[k];
        return Promise.resolve(out);
      }),
      set: vi.fn((items) => {
        Object.assign(data, items);
        return Promise.resolve();
      }),
    },
  };
}

describe('QueueManager', () => {
  let storage;
  let mockDeps;

  beforeEach(() => {
    storage = makeStorage();
    globalThis.chrome = {
      storage,
      runtime: { lastError: null },
      notifications: { create: vi.fn() },
    };
    mockDeps = {
      resolveCollectionDownload: vi.fn().mockResolvedValue({ url: 'https://files.nexus-cdn.com/123.zip' }),
      startDownload: vi.fn().mockResolvedValue({ success: true, downloadId: 42 }),
      dispatchNxmUrl: vi.fn().mockResolvedValue(true),
    };
  });

  it('initializes with empty idle queue', async () => {
    const qm = new QueueManager(mockDeps);
    await qm.init();
    const state = qm.getState();
    expect(state.status).toBe(QUEUE_STATUS.IDLE);
    expect(state.items).toHaveLength(0);
    expect(state.counts.total).toBe(0);
  });

  it('enqueues items and starts processing', async () => {
    const qm = new QueueManager(mockDeps);
    await qm.init();

    await qm.enqueueItems([
      { fileId: '101', modId: '202', modName: 'SkyUI', fileName: 'SkyUI.7z', isNMM: true },
      { fileId: '102', modId: '203', modName: 'USSEP', fileName: 'USSEP.7z', isNMM: false },
    ], { autoStart: false });

    const state = qm.getState();
    expect(state.items).toHaveLength(2);
    expect(state.counts.total).toBe(2);
    expect(state.counts.pending).toBe(2);
  });

  it('pauses and resumes queue processing', async () => {
    const qm = new QueueManager(mockDeps);
    await qm.init();

    await qm.enqueueItems([
      { fileId: '101', modId: '202', modName: 'SkyUI', isNMM: true },
    ], { autoStart: false });

    qm.pause();
    expect(qm.getState().status).toBe(QUEUE_STATUS.PAUSED);

    qm.resume();
    expect(qm.getState().status).toBe(QUEUE_STATUS.RUNNING);
  });

  it('skips a specific item', async () => {
    const qm = new QueueManager(mockDeps);
    await qm.init();

    await qm.enqueueItems([
      { fileId: '101', modId: '202', modName: 'SkyUI' },
    ], { autoStart: false });

    const item = qm.items[0];
    qm.skipItem(item.id);
    expect(qm.items[0].status).toBe(ITEM_STATUS.SKIPPED);
  });

  it('retries failed items', async () => {
    const qm = new QueueManager(mockDeps);
    await qm.init();

    await qm.enqueueItems([
      { fileId: '101', modId: '202', modName: 'SkyUI' },
    ], { autoStart: false });

    qm.items[0].status = ITEM_STATUS.FAILED;
    qm.items[0].error = 'Network drop';

    const result = qm.retryFailed();
    expect(result.retriedCount).toBe(1);
    expect([ITEM_STATUS.PENDING, ITEM_STATUS.RESOLVING]).toContain(qm.items[0].status);
    expect(qm.items[0].error).toBeNull();
  });

  it('clears completed items from queue', async () => {
    const qm = new QueueManager(mockDeps);
    await qm.init();

    await qm.enqueueItems([
      { fileId: '101', modName: 'Mod 1' },
      { fileId: '102', modName: 'Mod 2' },
    ], { autoStart: false });

    qm.items[0].status = ITEM_STATUS.COMPLETED;
    qm.items[1].status = ITEM_STATUS.PENDING;

    qm.clear();
    expect(qm.items).toHaveLength(0);
  });
});
