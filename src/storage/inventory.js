import { STORAGE_KEY_INVENTORY } from '../shared/constants.js';
import { createLogger } from '../shared/logger.js';

const log = createLogger('inventory');

export const DEFAULT_INVENTORY_STATE = {
  lastSync: 0,
  managerType: 'mo2',
  games: {},
};

/**
 * Normalizes mod names for fuzzy matching (stripping punctuation, version numbers, whitespace).
 */
export function normalizeModName(name) {
  if (!name || typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .replace(/\b(v|ver|version)\s*\d+(?:[._-]\d+)*[a-z]?\b/gi, '')
    .replace(/[._\-+]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Compares two semantic version strings or version numbers.
 * Returns 1 if vA > vB, -1 if vA < vB, 0 if equal/unparseable.
 */
export function compareVersions(vA, vB) {
  if (!vA || !vB) return 0;
  const cleanA = String(vA).replace(/^[^\d]*/, '').trim();
  const cleanB = String(vB).replace(/^[^\d]*/, '').trim();

  const partsA = cleanA.split(/[-.+_]/).map((n) => parseInt(n, 10) || 0);
  const partsB = cleanB.split(/[-.+_]/).map((n) => parseInt(n, 10) || 0);

  const len = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < len; i++) {
    const a = partsA[i] || 0;
    const b = partsB[i] || 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}

/**
 * Parses MO2 `modlist.txt`.
 * Lines start with `+` for enabled mods, `-` for disabled mods, `*` for separators.
 */
export function parseMo2Modlist(content) {
  if (!content || typeof content !== 'string') return { mods: [], separators: [] };
  const lines = content.split(/\r?\n/);
  const mods = [];
  const separators = [];

  let priority = 0;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    if (line.startsWith('*')) {
      separators.push(line.slice(1).trim());
      continue;
    }

    const isEnabled = line.startsWith('+');
    const isExplicitlyDisabled = line.startsWith('-');
    if (!isEnabled && !isExplicitlyDisabled) continue;

    const rawName = line.slice(1).trim();
    if (!rawName) continue;

    // Check for version or mod id pattern like "SkyUI_5.2SE" or "SkyUI (1234)" or "SkyUI - 5.2"
    let modName = rawName;
    let version = '';
    let modId = null;

    const idMatch = rawName.match(/\[(\d+)\]|\((\d+)\)/);
    if (idMatch) {
      modId = parseInt(idMatch[1] || idMatch[2], 10);
    }

    const versionMatch = rawName.match(/[-_ ]+(v?\d+(?:\.\d+)+(?:[a-zA-Z0-9_-]*))/i);
    if (versionMatch) {
      version = versionMatch[1];
    }

    mods.push({
      id: modId,
      name: modName,
      normalizedName: normalizeModName(modName),
      version,
      enabled: isEnabled,
      priority: priority++,
      source: 'mo2',
    });
  }

  return { mods, separators };
}

/**
 * Parses MO2 or plugins.txt load order.
 * Lines start with `*` for active plugins.
 */
export function parseMo2Plugins(content) {
  if (!content || typeof content !== 'string') return { plugins: [], activeCount: 0 };
  const lines = content.split(/\r?\n/);
  const plugins = [];
  let activeCount = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const isActive = line.startsWith('*');
    const pluginName = (isActive ? line.slice(1) : line).trim();
    if (pluginName) {
      if (isActive) activeCount++;
      plugins.push({ name: pluginName, active: isActive });
    }
  }

  return { plugins, activeCount };
}

/**
 * Parses Vortex state export JSON.
 */
export function parseVortexExport(content) {
  if (!content) return { mods: [] };
  let json = content;
  if (typeof content === 'string') {
    try {
      json = JSON.parse(content);
    } catch {
      return { mods: [] };
    }
  }

  const mods = [];
  const rawMods = Array.isArray(json) ? json : json.mods || Object.values(json.mods || {});

  for (const m of rawMods) {
    if (!m) continue;
    const name = m.name || m.modName || m.attributes?.modName || m.attributes?.name || '';
    const modId = m.modId || m.attributes?.modId || null;
    const version = m.version || m.attributes?.version || '';
    const enabled = m.state === 'installed' || m.enabled === true || m.attributes?.state === 'installed';

    if (name || modId) {
      mods.push({
        id: modId ? Number(modId) : null,
        name,
        normalizedName: normalizeModName(name),
        version,
        enabled,
        source: 'vortex',
      });
    }
  }

  return { mods };
}

/**
 * Parses raw newline-separated or CSV modlist text.
 */
export function parseGenericModList(content) {
  if (!content || typeof content !== 'string') return { mods: [] };
  const lines = content.split(/\r?\n/);
  const mods = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    mods.push({
      id: null,
      name: line,
      normalizedName: normalizeModName(line),
      version: '',
      enabled: true,
      source: 'custom',
    });
  }

  return { mods };
}

/**
 * Loads the stored mod inventory from local storage.
 */
export async function getInventory() {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) {
      return { ...DEFAULT_INVENTORY_STATE };
    }
    const res = await chrome.storage.local.get(STORAGE_KEY_INVENTORY);
    return res[STORAGE_KEY_INVENTORY] || { ...DEFAULT_INVENTORY_STATE };
  } catch (err) {
    log.error('Failed to get inventory', { error: err?.message });
    return { ...DEFAULT_INVENTORY_STATE };
  }
}

/**
 * Persists the mod inventory to local storage.
 */
export async function saveInventory(inventory) {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
    await chrome.storage.local.set({
      [STORAGE_KEY_INVENTORY]: {
        ...inventory,
        lastSync: Date.now(),
      },
    });
  } catch (err) {
    log.error('Failed to save inventory', { error: err?.message });
  }
}

/**
 * Imports and merges a mod list into a game's inventory domain.
 */
export async function importInventory(gameDomain, data, managerType = 'mo2') {
  if (!gameDomain) throw new Error('gameDomain is required for inventory import');
  const inventory = await getInventory();

  if (!inventory.games) inventory.games = {};
  if (!inventory.games[gameDomain]) {
    inventory.games[gameDomain] = {
      modCount: 0,
      pluginCount: 0,
      mods: {},
      plugins: [],
      separators: [],
    };
  }

  const gameData = inventory.games[gameDomain];
  let parsedMods = [];

  if (managerType === 'mo2') {
    const modlistResult = parseMo2Modlist(data.modlistText || data.rawText || '');
    parsedMods = modlistResult.mods;
    gameData.separators = modlistResult.separators;

    if (data.pluginsText) {
      const pluginResult = parseMo2Plugins(data.pluginsText);
      gameData.plugins = pluginResult.plugins;
      gameData.pluginCount = pluginResult.activeCount;
    }
  } else if (managerType === 'vortex') {
    const vortexResult = parseVortexExport(data.vortexJson || data.rawText || '');
    parsedMods = vortexResult.mods;
  } else {
    const genericResult = parseGenericModList(data.rawText || '');
    parsedMods = genericResult.mods;
  }

  const modMap = {};
  for (const mod of parsedMods) {
    const key = mod.id ? String(mod.id) : mod.normalizedName || mod.name;
    if (key) {
      modMap[key] = mod;
    }
  }

  gameData.mods = modMap;
  gameData.modCount = Object.keys(modMap).length;
  inventory.managerType = managerType;

  await saveInventory(inventory);
  return {
    gameDomain,
    modCount: gameData.modCount,
    pluginCount: gameData.pluginCount || 0,
    managerType,
  };
}

/**
 * Clears the inventory for a specific game or entirely.
 */
export async function clearInventory(gameDomain = null) {
  const inventory = await getInventory();
  if (gameDomain && inventory.games) {
    delete inventory.games[gameDomain];
  } else {
    inventory.games = {};
  }
  await saveInventory(inventory);
  return { ok: true };
}

/**
 * Matches a mod in the inventory by Mod ID or normalized Name.
 * Determines if installed, enabled, and if an update is available compared to latest online version.
 */
export function matchModInInventory(inventory, gameDomain, modId, modName, onlineVersion = null) {
  if (!inventory || !inventory.games || !gameDomain) {
    return { isInstalled: false, installedMod: null };
  }

  const game = inventory.games[gameDomain];
  if (!game || !game.mods) {
    return { isInstalled: false, installedMod: null };
  }

  // 1. Direct match by modId
  if (modId && game.mods[String(modId)]) {
    const installed = game.mods[String(modId)];
    const updateAvailable =
      onlineVersion && installed.version
        ? compareVersions(onlineVersion, installed.version) > 0
        : false;
    return {
      isInstalled: true,
      installedVersion: installed.version || null,
      isEnabled: installed.enabled !== false,
      updateAvailable,
      installedMod: installed,
    };
  }

  // 2. Fuzzy match by normalized name
  const normalizedTarget = normalizeModName(modName);
  if (!normalizedTarget) {
    return { isInstalled: false, installedMod: null };
  }

  for (const installed of Object.values(game.mods)) {
    if (
      installed.normalizedName === normalizedTarget ||
      (installed.normalizedName &&
        (installed.normalizedName.includes(normalizedTarget) ||
          normalizedTarget.includes(installed.normalizedName)))
    ) {
      const updateAvailable =
        onlineVersion && installed.version
          ? compareVersions(onlineVersion, installed.version) > 0
          : false;
      return {
        isInstalled: true,
        installedVersion: installed.version || null,
        isEnabled: installed.enabled !== false,
        updateAvailable,
        installedMod: installed,
      };
    }
  }

  return { isInstalled: false, installedMod: null };
}
