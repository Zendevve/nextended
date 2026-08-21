import { STORAGE_KEY_STATS } from '../shared/constants.js';
import { DEFAULT_STATS } from './defaults.js';


function getStorageArea() {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    return chrome.storage.local;
  }
  return null;
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
