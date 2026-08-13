import { describe, it, expect } from 'vitest';
import { extractCollectionDetails, isCollectionPage } from '../src/content/collection-detector.js';

describe('collection-detector', () => {
  describe('extractCollectionDetails', () => {
    it('extracts game domain and collection slug from base collection URL', () => {
      const result = extractCollectionDetails('/games/skyrimspecialedition/collections/iszwwe');
      expect(result).toEqual({
        gameDomain: 'skyrimspecialedition',
        collectionSlug: 'iszwwe',
        revisionNumber: null,
      });
    });

    it('extracts revision number when present in pathname', () => {
      const result = extractCollectionDetails('/games/cyberpunk2077/collections/mycollection/revisions/464');
      expect(result).toEqual({
        gameDomain: 'cyberpunk2077',
        collectionSlug: 'mycollection',
        revisionNumber: 464,
      });
    });

    it('returns null for non-collection paths', () => {
      expect(extractCollectionDetails('/skyrimspecialedition/mods/12345')).toBeNull();
      expect(extractCollectionDetails('/')).toBeNull();
      expect(extractCollectionDetails('')).toBeNull();
    });
  });

  describe('isCollectionPage', () => {
    it('returns true for valid nexusmods.com collection URLs', () => {
      expect(isCollectionPage('https://www.nexusmods.com/games/cyberpunk2077/collections/test')).toBe(true);
    });

    it('returns false for non-nexus domains or invalid collection URLs', () => {
      expect(isCollectionPage('https://example.com/games/cyberpunk2077/collections/test')).toBe(false);
      expect(isCollectionPage('https://www.nexusmods.com/skyrimspecialedition/mods/100')).toBe(false);
    });
  });
});
