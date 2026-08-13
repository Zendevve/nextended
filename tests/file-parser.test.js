import { describe, it, expect } from 'vitest';
import {
  parseFileId,
  parseFileIdFromElement,
  parseFileName,
  parseFileIdsFromString,
} from '../src/nexus/file-parser.js';

describe('file-parser', () => {
  it('parses numeric file IDs', () => {
    expect(parseFileId('123456')).toBe('123456');
    expect(parseFileId('  987 ')).toBe('987');
    expect(parseFileId(42)).toBe('42');
    expect(parseFileId('abc')).toBeNull();
    expect(parseFileId('')).toBeNull();
    expect(parseFileId(null)).toBeNull();
    expect(parseFileId(undefined)).toBeNull();
  });

  it('extracts file id from element data attributes', () => {
    const el = document.createElement('div');
    el.setAttribute('data-id', '555');
    expect(parseFileIdFromElement(el)).toBe('555');

    const el2 = document.createElement('div');
    el2.setAttribute('data-file-id', '666');
    expect(parseFileIdFromElement(el2)).toBe('666');
  });

  it('prefers data-id then falls back', () => {
    const el = document.createElement('div');
    el.setAttribute('data-id', '111');
    el.setAttribute('data-file-id', '222');
    expect(parseFileIdFromElement(el)).toBe('111');
  });

  it('returns null for element without id', () => {
    const el = document.createElement('div');
    expect(parseFileIdFromElement(el)).toBeNull();
  });

  it('parses file name from element text', () => {
    document.body.innerHTML = '<div><a class="file-link">My Mod File</a></div>';
    const el = document.querySelector('div');
    expect(parseFileName(el)).toBe('My Mod File');
  });

  it('returns fallback name', () => {
    const el = document.createElement('div');
    expect(parseFileName(el)).toBe('archived-file');
  });

  it('extracts ids from string', () => {
    const ids = parseFileIdsFromString('file_id=12345 and file_id=67890 and 12345');
    expect(ids.sort()).toEqual(['12345', '67890'].sort());
    expect(parseFileIdsFromString('no ids here')).toEqual([]);
  });
});
