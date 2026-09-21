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

  it('injects wrapper with nextended-namespaced class into classic accordion items', async () => {
    Object.defineProperty(window, 'location', {
      value: new URL('https://www.nexusmods.com/skyrim/mods/123?tab=files&category=archived'),
      writable: true
    });

    const fileList = document.createElement('dl');
    fileList.className = 'accordionitems';
    const dt = document.createElement('dt');
    dt.setAttribute('data-id', '555');
    const dd = document.createElement('dd');
    fileList.append(dt, dd);
    document.body.appendChild(fileList);

    await ArchiveInjector.inject();

    const wrapper = dd.querySelector('.nextended-archive-actions');
    expect(wrapper).not.toBeNull();
    expect(wrapper!.innerHTML).toContain('id=555');
    expect(wrapper!.innerHTML).toContain('nmm=1');
  });
});
