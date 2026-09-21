import { describe, it, expect, beforeEach } from 'vitest';
import { ModManagerButtonInjector } from '../../src/content/modules/modManagerButtonInjector';
import { ClickInterceptor } from '../../src/content/interceptors/clickInterceptor';
import { StorageManager } from '../../src/common/storage';

function setLocation(url: string) {
  Object.defineProperty(window, 'location', {
    value: new URL(url),
    writable: true
  });
}

function manualLink(href: string, label = 'Manual download'): HTMLAnchorElement {
  const a = document.createElement('a');
  a.className = 'btn inline-flex';
  a.href = href;
  a.innerHTML = `<span class="flex-label">${label}</span>`;
  return a;
}

function modernEntry(fileId: string, manualHref: string): { box: HTMLElement } {
  const header = document.createElement('div');
  header.className = 'file-expander-header';
  header.dataset.id = fileId;
  const box = document.createElement('div');
  box.className = 'accordion-downloads';
  box.appendChild(manualLink(manualHref));
  document.body.append(header, box);
  return { box };
}

describe('ModManagerButtonInjector', () => {
  beforeEach(async () => {
    await StorageManager.setConfig({ forceModManagerDownload: true });
    document.body.innerHTML = '';
    setLocation('https://www.nexusmods.com/skyrim/mods/123');
  });

  it('injects a manager button whose href reuses the entry file_id link with nmm=1', async () => {
    const { box } = modernEntry('999', '/skyrim/mods/123?tab=files&file_id=999');

    await ModManagerButtonInjector.inject();

    const btn = box.querySelector<HTMLAnchorElement>('a[data-nextended-manager-btn]');
    expect(btn).not.toBeNull();
    expect(btn!.getAttribute('href')).toBe('/skyrim/mods/123?tab=files&file_id=999&nmm=1');
    expect(btn!.textContent).toContain('Mod manager download');
    // Sits first, where the native manager button would be; native link untouched.
    expect(box.firstElementChild).toBe(btn);
    expect(box.querySelectorAll('a.btn').length).toBe(2);
    // The existing ClickInterceptor picks it up naturally: manager download, right file.
    expect(ClickInterceptor.isNMMDownload(btn, btn!.getAttribute('href') || '')).toBe(true);
    expect(ClickInterceptor.extractFileId(btn!.getAttribute('href') || '')).toBe('999');
  });

  it('reuses widget-style manual links (id= param) and resolves through the interceptor', async () => {
    setLocation('https://www.nexusmods.com/skyrim/mods/123?tab=files');
    const { box } = modernEntry('555', '/Core/Libs/Common/Widgets/DownloadPopUp?id=555&game_id=170');

    await ModManagerButtonInjector.inject();

    const btn = box.querySelector<HTMLAnchorElement>('a[data-nextended-manager-btn]');
    expect(btn).not.toBeNull();
    expect(btn!.getAttribute('href')).toBe('/Core/Libs/Common/Widgets/DownloadPopUp?id=555&game_id=170&nmm=1');
    expect(ClickInterceptor.extractFileId(btn!.getAttribute('href') || '')).toBe('555');
  });

  it('injects into classic accordion items action area', async () => {
    const list = document.createElement('dl');
    list.className = 'accordionitems';
    const dt = document.createElement('dt');
    dt.setAttribute('data-id', '555');
    const dd = document.createElement('dd');
    dd.appendChild(manualLink('/skyrim/mods/123?tab=files&file_id=555'));
    list.append(dt, dd);
    document.body.appendChild(list);

    await ModManagerButtonInjector.inject();

    const btn = dd.querySelector<HTMLAnchorElement>('a[data-nextended-manager-btn]');
    expect(btn).not.toBeNull();
    expect(btn!.getAttribute('href')).toBe('/skyrim/mods/123?tab=files&file_id=555&nmm=1');
  });

  it('adds no button when the entry already offers an nmm=1 manager link', async () => {
    const { box } = modernEntry('999', '/skyrim/mods/123?tab=files&file_id=999');
    box.appendChild(manualLink('/skyrim/mods/123?tab=files&file_id=999&nmm=1', 'Mod manager download'));

    await ModManagerButtonInjector.inject();

    expect(box.querySelector('a[data-nextended-manager-btn]')).toBeNull();
    expect(box.querySelectorAll('a').length).toBe(2);
  });

  it('adds no button when the entry has a manager-labeled control without nmm', async () => {
    const { box } = modernEntry('999', '/skyrim/mods/123?tab=files&file_id=999');
    const vortex = document.createElement('button');
    vortex.textContent = 'Vortex';
    box.appendChild(vortex);

    await ModManagerButtonInjector.inject();

    expect(box.querySelector('a[data-nextended-manager-btn]')).toBeNull();
    expect(box.querySelectorAll('a').length).toBe(1);
  });

  it('leaves the DOM untouched when the config is off', async () => {
    await StorageManager.setConfig({ forceModManagerDownload: false });
    const { box } = modernEntry('999', '/skyrim/mods/123?tab=files&file_id=999');
    const before = box.innerHTML;

    await ModManagerButtonInjector.inject();

    expect(box.innerHTML).toBe(before);
    expect(box.querySelector('a[data-nextended-manager-btn]')).toBeNull();
  });

  it('does not duplicate buttons on repeated scans', async () => {
    const { box } = modernEntry('999', '/skyrim/mods/123?tab=files&file_id=999');

    await ModManagerButtonInjector.inject();
    await ModManagerButtonInjector.inject();

    expect(box.querySelectorAll('a[data-nextended-manager-btn]').length).toBe(1);
  });

  it('skips entries with no file-id link to reuse', async () => {
    const { box } = modernEntry('999', '#');

    await ModManagerButtonInjector.inject();

    expect(box.querySelector('a[data-nextended-manager-btn]')).toBeNull();
  });

  it('skips surfaces outside mod file listings', async () => {
    setLocation('https://www.nexusmods.com/skyrim/mods/123?tab=description');
    const desc = modernEntry('999', '/skyrim/mods/123?tab=files&file_id=999');
    await ModManagerButtonInjector.inject();
    expect(desc.box.querySelector('a[data-nextended-manager-btn]')).toBeNull();

    document.body.innerHTML = '';
    setLocation('https://www.nexusmods.com/games/stardewvalley/collections/bbubvs');
    const coll = modernEntry('999', '/skyrim/mods/123?tab=files&file_id=999');
    await ModManagerButtonInjector.inject();
    expect(coll.box.querySelector('a[data-nextended-manager-btn]')).toBeNull();
  });
});
