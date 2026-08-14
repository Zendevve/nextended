import { describe, it, expect } from 'vitest';
import { sanitizeFilenamePart, formatDownloadPath, FileOrganizer } from '../../src/background/file-organizer.js';

describe('FileOrganizer', () => {
  it('sanitizes illegal filename characters', () => {
    expect(sanitizeFilenamePart('SkyUI: Special Edition / v1.2 *?<>|')).toBe('SkyUI_ Special Edition _ v1.2 _____');
  });

  it('formats download path according to template', () => {
    const item = {
      gameDomain: 'skyrimspecialedition',
      modName: 'SkyUI',
      fileVersion: '5.2SE',
      fileName: 'SkyUI_5_2_SE.7z',
    };
    const template = 'NexusMods/{game}/{mod_name} - {version}/{file_name}';
    const formatted = formatDownloadPath(template, item, 'SkyUI_5_2_SE.7z');
    expect(formatted).toBe('NexusMods/skyrimspecialedition/SkyUI - 5.2SE/SkyUI_5_2_SE.7z');
  });

  it('registers and unregisters download metadata', () => {
    const organizer = new FileOrganizer();
    const item = { modName: 'SkyUI' };
    organizer.registerDownload(123, item);
    expect(organizer.downloadMetadata.get(123).modName).toBe('SkyUI');

    organizer.unregisterDownload(123);
    expect(organizer.downloadMetadata.has(123)).toBe(false);
  });
});
