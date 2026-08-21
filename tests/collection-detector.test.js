import { describe, it, expect } from 'vitest';
import { extractCollectionDetails } from '../src/content/collection-detector.js';

describe('collection-detector', () => {
  describe('extractCollectionDetails', () => {
    it('extracts game domain and collection slug from legacy base collection URL', () => {
      const result = extractCollectionDetails('/games/skyrimspecialedition/collections/iszwwe');
      expect(result).toEqual({
        gameDomain: 'skyrimspecialedition',
        collectionSlug: 'iszwwe',
        revisionNumber: null,
      });
    });

    it('extracts revision number from legacy collection URL', () => {
      const result = extractCollectionDetails('/games/cyberpunk2077/collections/mycollection/revisions/464');
      expect(result).toEqual({
        gameDomain: 'cyberpunk2077',
        collectionSlug: 'mycollection',
        revisionNumber: 464,
      });
    });

    it('extracts game domain and collection slug from current base collection URL', () => {
      const result = extractCollectionDetails('/skyrimspecialedition/collections/iszwwe');
      expect(result).toEqual({
        gameDomain: 'skyrimspecialedition',
        collectionSlug: 'iszwwe',
        revisionNumber: null,
      });
    });

    it('extracts revision number from current collection URL', () => {
      const result = extractCollectionDetails('/cyberpunk2077/collections/mycollection/revisions/464');
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
});
