import {
  getInventory,
  importInventory,
  clearInventory,
  matchModInInventory,
} from '../storage/inventory.js';
import { RequirementCrawler } from '../nexus/requirement-crawler.js';
import { createLogger } from '../shared/logger.js';
import { ERROR_CODES, NexusDownloadError } from '../shared/errors.js';

const log = createLogger('inventory-handler');

/**
 * Handles importing a modlist or vortex export.
 */
export async function handleImportInventory(payload) {
  const { gameDomain, data, managerType } = payload || {};
  if (!gameDomain || !data) {
    throw new NexusDownloadError(
      ERROR_CODES.INVALID_INPUT,
      'gameDomain and data are required to import inventory'
    );
  }
  const result = await importInventory(gameDomain, data, managerType || 'mo2');
  log.info('Successfully imported mod inventory', result);
  return result;
}

/**
 * Handles retrieving the current inventory state.
 */
export async function handleGetInventory() {
  const inventory = await getInventory();
  return { inventory };
}

/**
 * Handles clearing inventory for a game or all games.
 */
export async function handleClearInventory(payload) {
  const { gameDomain } = payload || {};
  await clearInventory(gameDomain || null);
  return { ok: true };
}

/**
 * Checks a specific mod against local inventory.
 */
export async function handleCheckModInventory(payload) {
  const { gameDomain, modId, modName, onlineVersion } = payload || {};
  if (!gameDomain) {
    return { isInstalled: false, installedMod: null };
  }
  const inventory = await getInventory();
  return matchModInInventory(inventory, gameDomain, modId, modName, onlineVersion);
}

/**
 * Handles crawling a deep dependency tree.
 */
export async function handleCrawlDependencyTree(payload, deps = {}) {
  const { gameDomain, modId, maxDepth } = payload || {};
  if (!gameDomain || !modId) {
    throw new NexusDownloadError(
      ERROR_CODES.INVALID_INPUT,
      'gameDomain and modId are required to crawl dependencies'
    );
  }

  const client = deps.getCollectionClient ? deps.getCollectionClient() : null;
  const crawler = new RequirementCrawler(client);
  const result = await crawler.crawlTree(gameDomain, modId, { maxDepth: maxDepth || 3 });
  return result;
}

/**
 * Evaluates mod health and compatibility radar metrics.
 */
export async function handleGetModHealthRadar(payload) {
  const { gameDomain, modId, modName, targetGameVersion, bugCount, endorsementRatio } =
    payload || {};

  const inventory = await getInventory();
  const match = matchModInInventory(inventory, gameDomain, modId, modName);

  // Score calculation: 0 - 100
  let healthScore = 95;
  const warnings = [];
  const badges = [];

  if (bugCount && bugCount > 20) {
    healthScore -= 25;
    warnings.push(`High open bug report count (${bugCount} open issues)`);
  }

  if (endorsementRatio && endorsementRatio < 0.8) {
    healthScore -= 15;
    warnings.push(`Lower endorsement ratio (${Math.round(endorsementRatio * 100)}%)`);
  }

  if (targetGameVersion) {
    badges.push({
      label: `Game ${targetGameVersion}`,
      type: 'version',
      compatible: true,
    });
  }

  if (match.isInstalled) {
    badges.push({
      label: match.installedVersion ? `Installed v${match.installedVersion}` : 'Installed',
      type: 'installed',
      updateAvailable: match.updateAvailable,
    });
  } else {
    badges.push({
      label: 'Not in Local Load Order',
      type: 'not-installed',
    });
  }

  return {
    gameDomain,
    modId,
    healthScore: Math.max(0, healthScore),
    status: healthScore >= 80 ? 'healthy' : healthScore >= 50 ? 'caution' : 'warning',
    warnings,
    badges,
    inventoryMatch: match,
  };
}
