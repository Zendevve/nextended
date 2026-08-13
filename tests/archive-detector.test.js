import { describe, it, expect, beforeEach } from 'vitest';
import {
  isNexusModPage,
  isArchivePage,
  findArchivedFiles,
} from '../src/content/archive-detector.js';

const location = (href) => {
  const u = new URL(href);
  return {
    href,
    origin: u.origin,
    protocol: u.protocol,
    host: u.host,
    hostname: u.hostname,
    pathname: u.pathname,
    search: u.search,
    hash: u.hash,
  };
};

describe('archive-detector', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('detects nexus mod pages', () => {
    expect(
      isNexusModPage(location('https://www.nexusmods.com/skyrimspecialedition/mods/42'))
    ).toBe(true);
    expect(isNexusModPage(location('https://example.com/foo'))).toBe(false);
  });

  it('detects archive pages', () => {
    expect(
      isArchivePage(
        location(
          'https://www.nexusmods.com/skyrimspecialedition/mods/42?tab=files&category=archived'
        )
      )
    ).toBe(true);
    expect(
      isArchivePage(
        location(
          'https://www.nexusmods.com/skyrimspecialedition/mods/42?tab=files&category=active'
        )
      )
    ).toBe(false);
    expect(isArchivePage(location('https://example.com'))).toBe(false);
  });

  it('finds archived files with file IDs and game context', () => {
    document.body.innerHTML = `
      <body data-gameid="1704">
        <script>var g_GameID = 1704;</script>
        <div class="file-expander-header" data-id="12345">
          <a class="file-link">Old File 1</a>
        </div>
        <div class="file-expander-header" data-id="67890">
          <a class="fileLink">Old File 2</a>
        </div>
      </body>
    `;
    const files = findArchivedFiles(
      document,
      location(
        'https://www.nexusmods.com/skyrimspecialedition/mods/42?tab=files&category=archived'
      )
    );
    expect(files).toHaveLength(2);
    expect(files[0].fileId).toBe('12345');
    expect(files[1].fileId).toBe('67890');
    expect(files[0].gameId).toBe('1704');
    expect(files[0].gameSlug).toBe('skyrimspecialedition');
    expect(files[0].modId).toBe('42');
  });

  it('deduplicates repeated file IDs', () => {
    document.body.innerHTML = `
      <body data-gameid="1008">
        <div class="file-expander-header" data-id="12345"><a class="file-link">A</a></div>
        <div class="file-expander-header" data-id="12345"><a class="file-link">Dup</a></div>
      </body>
    `;
    const files = findArchivedFiles(
      document,
      location(
        'https://www.nexusmods.com/skyrimspecialedition/mods/1?tab=files&category=archived'
      )
    );
    expect(files).toHaveLength(1);
  });

  it('extracts file id from href file_id params as fallback', () => {
    document.body.innerHTML = `
      <body data-gameid="1704">
        <a href="/skyrimspecialedition/mods/42/files/99999">Some File</a>
      </body>
    `;
    const files = findArchivedFiles(
      document,
      location(
        'https://www.nexusmods.com/skyrimspecialedition/mods/42?tab=files&category=archived'
      )
    );
    expect(files).toHaveLength(1);
    expect(files[0].fileId).toBe('99999');
  });

  it('returns empty on non-archive page', () => {
    document.body.innerHTML = '<div data-id="12345"></div>';
    expect(
      findArchivedFiles(
        document,
        location('https://www.nexusmods.com/skyrimspecialedition/mods/42?tab=files')
      )
    ).toEqual([]);
  });
});
