import { describe, it, expect } from 'vitest';
import {
  parseUrlSafe,
  isSafeDownloadUrl,
  isNexusHost,
  isCdnHost,
  buildGenerateDownloadUrl,
  extractSlugFromPathname,
  toIntSafe,
  isIntString,
  extractFileIdFromUrl,
  extractSlugAndModId,
} from '../src/nexus/url-utils.js';

describe('url-utils', () => {
  it('parses valid URLs and rejects invalid ones', () => {
    expect(parseUrlSafe('https://example.com/a').hostname).toBe('example.com');
    expect(parseUrlSafe('not a url')).toBeNull();
    expect(parseUrlSafe('')).toBeNull();
  });

  it('int-strings are detected', () => {
    expect(isIntString('123')).toBe(true);
    expect(isIntString('  42 ')).toBe(true);
    expect(isIntString('abc')).toBe(false);
    expect(isIntString('')).toBe(false);
  });

  it('toIntSafe parses numbers', () => {
    expect(toIntSafe('1704')).toBe(1704);
    expect(toIntSafe(1704)).toBe(1704);
    expect(toIntSafe('nope')).toBeNull();
  });

  it('extracts slug from pathname', () => {
    expect(extractSlugFromPathname('/skyrimspecialedition/mods/42')).toBe(
      'skyrimspecialedition'
    );
    expect(extractSlugFromPathname('')).toBeNull();
  });

  it('classifies hosts', () => {
    expect(isNexusHost('nexusmods.com')).toBe(true);
    expect(isNexusHost('www.nexusmods.com')).toBe(true);
    expect(isNexusHost('sub.nexusmods.com')).toBe(true);
    expect(isNexusHost('example.com')).toBe(false);
    expect(isCdnHost('files.nexus-cdn.com')).toBe(true);
    expect(isCdnHost('foo.nexus-cdn.com')).toBe(true);
    expect(isCdnHost('evil.com')).toBe(false);
  });

  it('validates download URLs strictly', () => {
    expect(isSafeDownloadUrl('https://files.nexus-cdn.com/path/file.rar?token=x')).toBe(
      true
    );
    expect(
      isSafeDownloadUrl('https://www.nexusmods.com/skyrimspecialedition/mods/42')
    ).toBe(true);
    expect(isSafeDownloadUrl('https://evil.example/file.zip')).toBe(false);
    expect(isSafeDownloadUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeDownloadUrl('data:text/html,foo')).toBe(false);
    expect(isSafeDownloadUrl('blob:https://evil/abc')).toBe(false);
    expect(isSafeDownloadUrl('HTTPS://files.nexus-cdn.com/x')).toBe(true);
    expect(isSafeDownloadUrl('http://files.nexus-cdn.com/x')).toBe(false);
    expect(isSafeDownloadUrl('ftp://files.nexus-cdn.com/x')).toBe(false);
    expect(isSafeDownloadUrl('not-a-url')).toBe(false);
    expect(isSafeDownloadUrl(null)).toBe(false);
  });

  it('builds GenerateDownloadUrl endpoint', () => {
    const u = buildGenerateDownloadUrl('skyrimspecialedition', '123456', '1704');
    expect(u).toContain('/skyrimspecialedition/Core/Downloads/GenerateDownloadUrl');
    const url = new URL(u);
    expect(url.searchParams.get('file_id')).toBe('123456');
    expect(url.searchParams.get('game_id')).toBe('1704');
  });

  it('omits game_id when gameId is 0 or empty string in buildGenerateDownloadUrl', () => {
    const u0 = buildGenerateDownloadUrl('stardewvalley', '999', '0');
    expect(u0).toBe('https://www.nexusmods.com/stardewvalley/Core/Downloads/GenerateDownloadUrl?file_id=999');
    const url0 = new URL(u0);
    expect(url0.searchParams.has('game_id')).toBe(false);

    const uEmpty = buildGenerateDownloadUrl('stardewvalley', '999', '');
    expect(uEmpty).toBe('https://www.nexusmods.com/stardewvalley/Core/Downloads/GenerateDownloadUrl?file_id=999');
  });

  it('extractFileIdFromUrl extracts file_id, fileId, or id', () => {
    expect(extractFileIdFromUrl(new URLSearchParams('?file_id=123'))).toBe('123');
    expect(extractFileIdFromUrl(new URLSearchParams('?fileId=456'))).toBe('456');
    expect(extractFileIdFromUrl(new URLSearchParams('?id=999'))).toBe('999');
    expect(extractFileIdFromUrl(new URLSearchParams('?other=abc'))).toBeNull();
    expect(extractFileIdFromUrl(null)).toBeNull();
  });

  it('extractSlugAndModId extracts slug and modId from URLs and paths', () => {
    expect(
      extractSlugAndModId('https://www.nexusmods.com/skyrimspecialedition/mods/12345')
    ).toEqual({ slug: 'skyrimspecialedition', modId: '12345' });

    expect(
      extractSlugAndModId('https://www.nexusmods.com/stardewvalley/mods/42?tab=files')
    ).toEqual({ slug: 'stardewvalley', modId: '42' });

    expect(extractSlugAndModId('/cyberpunk2077/mods/999/files')).toEqual({
      slug: 'cyberpunk2077',
      modId: '999',
    });

    expect(extractSlugAndModId('not-a-url')).toEqual({ slug: null, modId: null });
    expect(extractSlugAndModId('https://www.nexusmods.com/mods/12345')).toEqual({
      slug: null,
      modId: null,
    });
    expect(extractSlugAndModId('')).toEqual({ slug: null, modId: null });
    expect(extractSlugAndModId(null)).toEqual({ slug: null, modId: null });
    expect(extractSlugAndModId(123)).toEqual({ slug: null, modId: null });
  });
});
