import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getSettings,
  setSettings,
  updateSettings,
  incrementStat,
  getStats,
} from '../src/storage/settings.js';
import { DEFAULT_SETTINGS } from '../src/storage/defaults.js';

function makeStorage() {
  const data = {};
  return {
    local: {
      get: vi.fn((keys, cb) => {
        const out = {};
        if (typeof keys === 'string') {
          out[keys] = data[keys];
        } else {
          for (const k of keys) out[k] = data[k];
        }
        if (cb) cb(out);
        return Promise.resolve(out);
      }),
      set: vi.fn((items, cb) => {
        Object.assign(data, items);
        if (cb) cb();
        return Promise.resolve();
      }),
      remove: vi.fn((keys, cb) => {
        if (cb) cb();
        return Promise.resolve();
      }),
    },
  };
}

describe('settings', () => {
  let storage;
  beforeEach(() => {
    storage = makeStorage();
    globalThis.chrome = { storage, runtime: { lastError: null } };
  });

  it('returns defaults when nothing stored', async () => {
    const s = await getSettings();
    expect(s.enabled).toBe(DEFAULT_SETTINGS.enabled);
    expect(s.handleCollections).toBe(true);
  });

  it('persists and merges settings', async () => {
    await setSettings({ enabled: false, debugLogging: true });
    const s = await getSettings();
    expect(s.enabled).toBe(false);
    expect(s.debugLogging).toBe(true);
    expect(s.requestTimeout).toBe(DEFAULT_SETTINGS.requestTimeout);
  });

  it('updates a single field', async () => {
    const s = await updateSettings({ requestTimeout: 5000 });
    expect(s.requestTimeout).toBe(5000);
    const again = await getSettings();
    expect(again.requestTimeout).toBe(5000);
  });

  it('returns empty stats default', async () => {
    const stats = await getStats();
    expect(stats.collectionsDownloaded).toBe(0);
  });

  it('increments stats', async () => {
    await incrementStat('collectionsDownloaded');
    const stats = await getStats();
    expect(stats.collectionsDownloaded).toBe(1);
  });
});
