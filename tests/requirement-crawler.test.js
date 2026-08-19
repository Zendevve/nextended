import { describe, it, expect, vi } from 'vitest';
import { RequirementCrawler } from '../src/nexus/requirement-crawler.js';

describe('RequirementCrawler', () => {
  it('crawls recursive dependency trees and avoids infinite cycles', async () => {
    const mockClient = {
      fetchModRequirements: vi.fn(async (gameDomain, modId) => {
        if (Number(modId) === 100) {
          return {
            name: 'Root Mod',
            version: '1.0',
            requirements: [
              { modId: 200, name: 'Framework Mod' },
              { modId: 300, name: 'Address Library' },
            ],
          };
        }
        if (Number(modId) === 200) {
          return {
            name: 'Framework Mod',
            version: '2.0',
            requirements: [{ modId: 100, name: 'Root Mod (Circular)' }],
          };
        }
        if (Number(modId) === 300) {
          return {
            name: 'Address Library for SKSE Plugins',
            version: '8.0',
            requirements: [],
          };
        }
        return null;
      }),
    };

    const crawler = new RequirementCrawler(mockClient);
    const result = await crawler.crawlTree('skyrimspecialedition', 100, { maxDepth: 3 });

    expect(result.root).not.toBeNull();
    expect(result.root.name).toBe('Root Mod');
    expect(result.root.children.length).toBe(2);

    // Deepest dependencies (Framework Mod / Address Library) are sorted first in reverse topological order
    expect(result.flattened.length).toBe(2);
    expect(result.flattened.some((n) => n.modId === 200)).toBe(true);
    expect(result.flattened.some((n) => n.modId === 300)).toBe(true);

    // Identifies frameworks & script extenders
    const addressLib = result.flattened.find((n) => n.modId === 300);
    expect(addressLib.isExtender).toBe(true);
    expect(addressLib.isFramework).toBe(true);
  });
});
