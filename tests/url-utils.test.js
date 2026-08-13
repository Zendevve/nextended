import { describe, it, expect } from 'vitest';
import {
  parseUrlSafe,
  isSafeDownloadUrl,
  isNexusHost,
  isCdnHost,
  buildGenerateDownloadUrl,
  buildFilePageUrl,
  isArchivedQuery,
  extractSlugFromPathname,
  toIntSafe,
  isIntString,
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

  it('builds file page URL', () => {
    const u = buildFilePageUrl('skyrimspecialedition', '42', '123456');
    const url = new URL(u);
    expect(url.pathname).toBe('/skyrimspecialedition/mods/42');
    expect(url.searchParams.get('tab')).toBe('files');
    expect(url.searchParams.get('file_id')).toBe('123456');
  });

  it('detects archived query', () => {
    expect(isArchivedQuery(new URLSearchParams('category=archived'))).toBe(true);
    expect(isArchivedQuery(new URLSearchParams('category=active'))).toBe(false);
  });
});
