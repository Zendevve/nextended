import { createLogger } from '../shared/logger.js';

const log = createLogger('requirement-crawler');

export class RequirementCrawler {
  constructor(collectionClient) {
    this.client = collectionClient;
  }

  /**
   * Recursively crawls the requirement dependency tree for a root mod.
   * @param {string} gameDomain
   * @param {number|string} modId
   * @param {Object} options
   * @param {number} [options.maxDepth=3]
   * @param {Set} [options.visited]
   * @returns {Promise<Object>} The dependency node tree and flattened ordered list.
   */
  async crawlTree(gameDomain, modId, options = {}) {
    const maxDepth = options.maxDepth || 3;
    const visited = options.visited || new Set();
    const flattened = [];

    const rootNode = await this._crawlNode(
      gameDomain,
      Number(modId),
      1,
      maxDepth,
      visited,
      flattened
    );

    // Sort flattened list in reverse topological dependency order
    // (deepest dependencies first so frameworks install before dependent mods)
    const sorted = [...flattened].sort((a, b) => b.depth - a.depth);

    return {
      root: rootNode,
      flattened: sorted,
      totalCount: sorted.length,
    };
  }

  async _crawlNode(gameDomain, modId, currentDepth, maxDepth, visited, flattened) {
    const idKey = `${gameDomain}:${modId}`;
    if (visited.has(idKey)) {
      return {
        modId,
        gameDomain,
        name: `Mod #${modId} (Already resolved)`,
        isDuplicate: true,
        children: [],
        depth: currentDepth,
      };
    }
    visited.add(idKey);

    let modDetails = null;
    try {
      if (this.client && typeof this.client.fetchModRequirements === 'function') {
        modDetails = await this.client.fetchModRequirements(gameDomain, modId);
      }
    } catch (err) {
      log.warn('Failed to fetch mod requirements from client', { modId, error: err?.message });
    }

    const node = {
      modId,
      gameDomain,
      name: modDetails?.name || `Mod #${modId}`,
      version: modDetails?.version || '',
      summary: modDetails?.summary || '',
      depth: currentDepth,
      isOffsite: false,
      isExtender: this._isScriptExtender(modDetails?.name || ''),
      isFramework: this._isFramework(modDetails?.name || ''),
      children: [],
    };

    if (currentDepth > 1) {
      flattened.push(node);
    }

    // In live execution or simulated mock tests, extract children
    const childReqs = modDetails?.requirements || [];
    if (currentDepth < maxDepth && childReqs.length > 0) {
      for (const req of childReqs) {
        if (req.modId) {
          const childNode = await this._crawlNode(
            gameDomain,
            req.modId,
            currentDepth + 1,
            maxDepth,
            visited,
            flattened
          );
          node.children.push(childNode);
        }
      }
    }

    return node;
  }

  _isScriptExtender(name) {
    const lower = name.toLowerCase();
    return lower.includes('skse') || lower.includes('f4se') || lower.includes('nvse') || lower.includes('script extender');
  }

  _isFramework(name) {
    const lower = name.toLowerCase();
    return lower.includes('framework') || lower.includes('library') || lower.includes('core') || lower.includes('address library');
  }
}
