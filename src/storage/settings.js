import { STORAGE_KEY_SETTINGS, STORAGE_KEY_STATS } from '../shared/constants.js';
import { DEFAULT_SETTINGS, DEFAULT_STATS, STORAGE_VERSION } from './defaults.js';
import { createLogger } from '../shared/logger.js';

const log = createLogger('storage');

function getStorageArea() {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    return chrome.storage.local;
  }
  return null;
}

function coerceSetting(value, fallback) {
  if (typeof fallback === 'boolean') return !!value;
  if (typeof fallback === 'number') {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }
  return value == null ? fallback : String(value);
}

function coerceSettings(raw) {
  const out = {};
  for (const [key, fallback] of Object.entries(DEFAULT_SETTINGS)) {
    out[key] = key in raw ? coerceSetting(raw[key], fallback) : fallback;
  }
  return out;
}

export async function getSettings() {
  const area = getStorageArea();
  if (!area) return { ...DEFAULT_SETTINGS, __version: STORAGE_VERSION };
  try {
    const raw = await area.get(STORAGE_KEY_SETTINGS);
    const stored = raw[STORAGE_KEY_SETTINGS] || {};
    const merged = { ...DEFAULT_SETTINGS, ...coerceSettings(stored) };
    if (stored.__version !== STORAGE_VERSION) {
      const migrated = { ...merged, __version: STORAGE_VERSION };
      try {
        await area.set({ [STORAGE_KEY_SETTINGS]: migrated });
      } catch (e) {
        log.error('Failed to persist settings after migration', { error: e?.message });
      }
      return migrated;
    }
    return merged;
  } catch (e) {
    log.error('Failed to read settings', { error: e?.message });
    return { ...DEFAULT_SETTINGS, __version: STORAGE_VERSION };
  }
}

export async function setSettings(settings) {
  const area = getStorageArea();
  if (!area) return { ...DEFAULT_SETTINGS, __version: STORAGE_VERSION, ...settings };
  const merged = { ...DEFAULT_SETTINGS, __version: STORAGE_VERSION, ...settings };
  try {
    await area.set({ [STORAGE_KEY_SETTINGS]: merged });
  } catch (e) {
    log.error('Failed to persist settings', { error: e?.message });
  }
  return merged;
}

export async function updateSettings(patch) {
  const current = await getSettings();
  return setSettings({ ...current, ...patch });
}

export async function resetSettings() {
  return setSettings({ ...DEFAULT_SETTINGS });
}

export async function getStats() {
  const area = getStorageArea();
  if (!area) return { ...DEFAULT_STATS };
  try {
    const raw = await area.get(STORAGE_KEY_STATS);
    return { ...DEFAULT_STATS, ...(raw[STORAGE_KEY_STATS] || {}) };
  } catch {
    return { ...DEFAULT_STATS };
  }
}

export async function incrementStat(key, by = 1) {
  const area = getStorageArea();
  if (!area) return;
  const stats = await getStats();
  stats[key] = (stats[key] || 0) + by;
  try {
    await area.set({ [STORAGE_KEY_STATS]: stats });
  } catch {
    /* ignore */
  }
}
