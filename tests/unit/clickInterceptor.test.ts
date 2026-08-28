import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClickInterceptor } from '../../src/content/interceptors/clickInterceptor';
import { GraphQLClient } from '../../src/content/modules/graphQLClient';

describe('ClickInterceptor', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    window.history.pushState({}, '', '/');
    delete (window as unknown as Record<string, unknown>).current_game_id;
    delete (window as unknown as Record<string, unknown>).gameId;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    window.history.pushState({}, '', '/');
    delete (window as unknown as Record<string, unknown>).current_game_id;
    delete (window as unknown as Record<string, unknown>).gameId;
  });

  describe('extractFileId', () => {
    it('extracts fileId from URL query ?tab=files&file_id=51105', () => {
      const url = 'https://www.nexusmods.com/stardewvalley/mods/1105?tab=files&file_id=51105';
      expect(ClickInterceptor.extractFileId(url)).toBe('51105');
    });

    it('extracts fileId from URL query ?id=51105', () => {
      const url = 'https://www.nexusmods.com/Core/Libs/Common/Widgets/ModRequirementsPopUp?id=51105&game_id=1303';
      expect(ClickInterceptor.extractFileId(url)).toBe('51105');
    });

    it('extracts fileId from DOM element with data-file-id="51105"', () => {
      const btn = document.createElement('button');
      btn.setAttribute('data-file-id', '51105');
      expect(ClickInterceptor.extractFileId('', btn)).toBe('51105');
    });

    it('extracts fileId from DOM element with data-id="51105"', () => {
      const btn = document.createElement('button');
      btn.setAttribute('data-id', '51105');
      expect(ClickInterceptor.extractFileId('', btn)).toBe('51105');
    });

    it('extracts fileId from parent container <div class="file-expander-header" data-id="51105">', () => {
      const parent = document.createElement('div');
      parent.className = 'file-expander-header';
      parent.setAttribute('data-id', '51105');

      const childBtn = document.createElement('button');
      childBtn.textContent = 'Manual Download';
      parent.appendChild(childBtn);
      document.body.appendChild(parent);

      expect(ClickInterceptor.extractFileId('', childBtn)).toBe('51105');
    });

    it('extracts fileId from <mod-download-buttons main-file=\'{"id": 51105}\'>', () => {
      const customEl = document.createElement('mod-download-buttons');
      customEl.setAttribute('main-file', JSON.stringify({ id: 51105 }));

      const childBtn = document.createElement('button');
      childBtn.className = 'btn inline-flex';
      customEl.appendChild(childBtn);
      document.body.appendChild(customEl);

      expect(ClickInterceptor.extractFileId('', childBtn)).toBe('51105');
      expect(ClickInterceptor.extractFileId('', customEl)).toBe('51105');
    });

    it('extracts fileId from nxm:// protocol URL query parameter', () => {
      const nxmUrl = 'nxm://stardewvalley/mods/1105/files/51105?id=51105&game_id=1303&key=abc&expires=1700000000&user_id=123';
      expect(ClickInterceptor.extractFileId(nxmUrl)).toBe('51105');

      const nxmUrlAlt = 'nxm://stardewvalley/mods/1105/files/51105?file_id=51105&game_id=1303';
      expect(ClickInterceptor.extractFileId(nxmUrlAlt)).toBe('51105');
    });

    it('extracts fileId from api/files path', () => {
      const apiUrl = 'https://www.nexusmods.com/api/files/51105';
      expect(ClickInterceptor.extractFileId(apiUrl)).toBe('51105');
    });

    it('returns null when no fileId can be resolved', () => {
      expect(ClickInterceptor.extractFileId('https://www.nexusmods.com/stardewvalley/mods/1105')).toBeNull();
      expect(ClickInterceptor.extractFileId('', document.createElement('div'))).toBeNull();
    });
  });

  describe('getGameIdFromContext', () => {
    it('extracts gameId from meta[name="game-id"]', () => {
      const meta = document.createElement('meta');
      meta.name = 'game-id';
      meta.content = '1303';
      document.head.appendChild(meta);

      expect(ClickInterceptor.getGameIdFromContext()).toBe('1303');
    });

    it('extracts gameId from __NEXT_DATA__ JSON script', () => {
      const script = document.createElement('script');
      script.id = '__NEXT_DATA__';
      script.type = 'application/json';
      script.textContent = JSON.stringify({
        props: {
          pageProps: {
            game: {
              id: 1303
            }
          }
        }
      });
      document.body.appendChild(script);

      expect(ClickInterceptor.getGameIdFromContext()).toBe('1303');
    });

    it('extracts gameId from window.current_game_id', () => {
      (window as unknown as Record<string, unknown>).current_game_id = 1303;
      expect(ClickInterceptor.getGameIdFromContext()).toBe('1303');
    });

    it('extracts gameId from window.gameId', () => {
      (window as unknown as Record<string, unknown>).gameId = '1303';
      expect(ClickInterceptor.getGameIdFromContext()).toBe('1303');
    });

    it('extracts gameId from location.search game_id parameter', () => {
      window.history.pushState({}, '', '/stardewvalley/mods/1105?game_id=1303');
      expect(ClickInterceptor.getGameIdFromContext()).toBe('1303');
    });

    it('extracts gameId from #section dataset gameId', () => {
      const section = document.createElement('div');
      section.id = 'section';
      section.dataset.gameId = '1303';
      document.body.appendChild(section);

      expect(ClickInterceptor.getGameIdFromContext()).toBe('1303');
    });

    it('returns empty string when no gameId is in context', () => {
      expect(ClickInterceptor.getGameIdFromContext()).toBe('');
    });
  });

  describe('getGameId', () => {
    it('extracts gameId from mod-download-buttons custom element ancestor', () => {
      const container = document.createElement('mod-download-buttons');
      container.setAttribute('game-id', '1303');
      const btn = document.createElement('button');
      container.appendChild(btn);
      document.body.appendChild(container);

      expect(ClickInterceptor.getGameId(btn)).toBe('1303');
      expect(ClickInterceptor.getGameId(container)).toBe('1303');
    });

    it('extracts gameId from mod-file-download custom element ancestor', () => {
      const container = document.createElement('mod-file-download');
      container.setAttribute('game-id', '1303');
      const btn = document.createElement('button');
      container.appendChild(btn);
      document.body.appendChild(container);

      expect(ClickInterceptor.getGameId(btn)).toBe('1303');
    });

    it('extracts gameId from DOM element with data-game-id', () => {
      const el = document.createElement('div');
      el.setAttribute('data-game-id', '1303');
      document.body.appendChild(el);

      expect(ClickInterceptor.getGameId(null)).toBe('1303');
    });

    it('extracts gameId from inline script tag matching game_id pattern', () => {
      const script = document.createElement('script');
      script.textContent = 'var config = { game_id: 1303 };';
      document.body.appendChild(script);

      expect(ClickInterceptor.getGameId(null)).toBe('1303');
    });

    it('extracts gameId from inline script tag matching gameId pattern', () => {
      const script = document.createElement('script');
      script.textContent = 'const state = { gameId: 1303 };';
      document.body.appendChild(script);

      expect(ClickInterceptor.getGameId(null)).toBe('1303');
    });

    it('extracts gameId from #section dataset gameId', () => {
      const section = document.createElement('div');
      section.id = 'section';
      section.dataset.gameId = '1303';
      document.body.appendChild(section);

      expect(ClickInterceptor.getGameId(null)).toBe('1303');
    });

    it('falls back to location.pathname domain slug if no game-id attributes exist', () => {
      window.history.pushState({}, '', '/stardewvalley/mods/1105');
      expect(ClickInterceptor.getGameId(null)).toBe('stardewvalley');
    });
  });

  describe('resolveGameId', () => {
    it('returns direct numeric gameId immediately', async () => {
      const container = document.createElement('div');
      container.setAttribute('data-game-id', '1303');
      document.body.appendChild(container);

      const resolved = await ClickInterceptor.resolveGameId(container);
      expect(resolved).toBe('1303');
    });

    it('resolves domain name slug to numeric ID via GraphQLClient.fetchGameId', async () => {
      window.history.pushState({}, '', '/stardewvalley/mods/1105');
      const fetchSpy = vi.spyOn(GraphQLClient, 'fetchGameId').mockResolvedValue('1303');

      const resolved = await ClickInterceptor.resolveGameId(null);
      expect(resolved).toBe('1303');
      expect(fetchSpy).toHaveBeenCalledWith('stardewvalley');
    });

    it('returns context gameId if available and direct is not numeric', async () => {
      window.history.pushState({}, '', '/stardewvalley/mods/1105');
      const meta = document.createElement('meta');
      meta.name = 'game-id';
      meta.content = '1303';
      document.head.appendChild(meta);

      const resolved = await ClickInterceptor.resolveGameId(null);
      expect(resolved).toBe('1303');
    });
  });

  describe('isNMMDownload', () => {
    it('detects nxm:// URLs', () => {
      expect(ClickInterceptor.isNMMDownload(null, 'nxm://stardewvalley/mods/1105/files/51105')).toBe(true);
    });

    it('detects nmm=1 in URL parameter', () => {
      expect(ClickInterceptor.isNMMDownload(null, 'https://www.nexusmods.com/file?nmm=1')).toBe(true);
      expect(ClickInterceptor.isNMMDownload(null, 'https://www.nexusmods.com/file?foo=bar&nmm=1')).toBe(true);
    });

    it('detects data-nextended-is-nmm dataset flag', () => {
      const btn = document.createElement('button');
      btn.dataset.nextendedIsNmm = '1';
      expect(ClickInterceptor.isNMMDownload(btn)).toBe(true);

      btn.dataset.nextendedIsNmm = '0';
      expect(ClickInterceptor.isNMMDownload(btn)).toBe(false);
    });

    it('detects action-vortex and action-nmm element IDs', () => {
      const vortexBtn = document.createElement('button');
      vortexBtn.id = 'action-vortex';
      expect(ClickInterceptor.isNMMDownload(vortexBtn)).toBe(true);

      const nmmBtn = document.createElement('button');
      nmmBtn.id = 'action-nmm';
      expect(ClickInterceptor.isNMMDownload(nmmBtn)).toBe(true);
    });

    it('detects text content matching mod manager download', () => {
      const btn = document.createElement('button');
      btn.textContent = 'Mod Manager Download';
      expect(ClickInterceptor.isNMMDownload(btn)).toBe(true);

      const ariaBtn = document.createElement('button');
      ariaBtn.setAttribute('aria-label', 'Download with Vortex');
      expect(ClickInterceptor.isNMMDownload(ariaBtn)).toBe(true);
    });

    it('returns false for manual download elements without nmm indicators', () => {
      const manualBtn = document.createElement('button');
      manualBtn.textContent = 'Manual Download';
      expect(ClickInterceptor.isNMMDownload(manualBtn, 'https://www.nexusmods.com/download')).toBe(false);
    });
  });
});
