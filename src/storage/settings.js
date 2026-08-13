import { STORAGE_KEY_SETTINGS, STORAGE_KEY_STATS } from '../shared/constants.js';
import { DEFAULT_SETTINGS, DEFAULT_STATS } from './defaults.js';
import { createLogger } from '../shared/logger.js';

const log = createLogger('storage');

function getStorageArea() {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    return chrome.storage.local;
  }
  return null;
}

export async function getSettings() {
  const area = getStorageArea();
  if (!area) return { ...DEFAULT_SETTINGS };
  try {
    const raw = await area.get(STORAGE_KEY_SETTINGS);
    const stored = raw[STORAGE_KEY_SETTINGS] || {};
    return { ...DEFAULT_SETTINGS, ...stored };
  } catch (e) {
    log.error('Failed to read settings', { error: e?.message });
    return { ...DEFAULT_SETTINGS };
  }
}

export async function setSettings(settings) {
  const area = getStorageArea();
  if (!area) return settings;
  const merged = { ...DEFAULT_SETTINGS, ...settings };
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
