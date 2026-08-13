import { describe, it, expect } from 'vitest';
import {
  isModPage,
  extractFileId,
  isNMMDownload,
  appendNmmParam,
} from '../src/content/no-wait.js';

describe('no-wait helpers', () => {
  it('detects mod pages correctly', () => {
    expect(isModPage({ pathname: '/stardewvalley/mods/1234' })).toBe(true);
    expect(isModPage({ pathname: '/skyrimspecialedition/mods/56789' })).toBe(true);
    expect(isModPage({ pathname: '/games/stardewvalley/collections/tckf0m' })).toBe(false);
  });

  it('extracts file id from various URL formats', () => {
    expect(extractFileId('https://www.nexusmods.com/stardewvalley/mods/1234?tab=files&file_id=9999')).toBe('9999');
    expect(extractFileId('https://www.nexusmods.com/stardewvalley/mods/1234/files/8888')).toBe('8888');
    expect(extractFileId('nxm://stardewvalley/mods/1234/files/7777?id=7777')).toBe('7777');
  });

  it('detects NMM / Vortex downloads', () => {
    expect(isNMMDownload(null, 'nxm://stardewvalley/mods/1234/files/7777')).toBe(true);
    expect(isNMMDownload(null, 'https://www.nexusmods.com/file?nmm=1')).toBe(true);
    expect(isNMMDownload(null, 'https://www.nexusmods.com/file?manual=1')).toBe(false);

    const btn = { textContent: 'Vortex Download', dataset: {} };
    expect(isNMMDownload(btn, '')).toBe(true);

    const btnManual = { textContent: 'Manual Download', dataset: {} };
    expect(isNMMDownload(btnManual, '')).toBe(false);
  });

  it('appends nmm parameter to URLs', () => {
    expect(appendNmmParam('https://www.nexusmods.com/file?id=123')).toBe('https://www.nexusmods.com/file?id=123&nmm=1');
    expect(appendNmmParam('https://www.nexusmods.com/file')).toBe('https://www.nexusmods.com/file?nmm=1');
    expect(appendNmmParam('https://www.nexusmods.com/file?nmm=1')).toBe('https://www.nexusmods.com/file?nmm=1');
  });
});
