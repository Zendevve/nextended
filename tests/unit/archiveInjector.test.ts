import { describe, it, expect, beforeEach } from 'vitest';
import { ArchiveInjector } from '../../src/content/modules/archiveInjector';
import { StorageManager } from '../../src/common/storage';

describe('ArchiveInjector', () => {
  beforeEach(async () => {
    await StorageManager.setConfig({ handleArchivedFiles: true });
    document.body.innerHTML = '';
  });

  it('injects download buttons into archived accordion headers', async () => {
    // Set location pathname to match mod pattern
    Object.defineProperty(window, 'location', {
      value: new URL('https://www.nexusmods.com/skyrim/mods/123?tab=files&category=archived'),
      writable: true
    });

    const header = document.createElement('div');
    header.className = 'file-expander-header';
    header.dataset.id = '999';

    const box = document.createElement('div');
    box.className = 'accordion-downloads';

    document.body.appendChild(header);
    document.body.appendChild(box);

    await ArchiveInjector.inject();

    expect(box.innerHTML).toContain('Mod manager download');
    expect(box.innerHTML).toContain('Manual download');
    expect(box.innerHTML).toContain('file_id=999');
  });
});
