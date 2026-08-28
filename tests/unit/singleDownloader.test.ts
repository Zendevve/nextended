import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SingleDownloader } from '../../src/content/modules/singleDownloader';
import { GraphQLClient } from '../../src/content/modules/graphQLClient';
import { ENDPOINTS } from '../../src/common/endpoints';

interface GlobalWithChrome {
  chrome?: {
    runtime?: {
      sendMessage: (message: unknown) => void;
    };
  };
}

describe('SingleDownloader URL Resolution Logic', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    window.history.pushState({}, '', '/');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    window.history.pushState({}, '', '/');
  });

  it('parses direct JSON download url responses', () => {
    const jsonText = JSON.stringify({ url: 'https://files.nexus-cdn.com/123/mod.zip?key=abc&expires=999' });
    const url = SingleDownloader.parseDownloadURLFromResponse(jsonText);
    expect(url).toBe('https://files.nexus-cdn.com/123/mod.zip?key=abc&expires=999');
  });

  it('parses HTML dl_link input value', () => {
    const html = '<div><input id="dl_link" value="https://files.nexus-cdn.com/456/mod.zip&amp;key=xyz" /></div>';
    const url = SingleDownloader.parseDownloadURLFromResponse(html);
    expect(url).toBe('https://files.nexus-cdn.com/456/mod.zip&key=xyz');
  });

  it('parses valid NXM links with key and expires', () => {
    const nxm = 'nxm://skyrim/mods/1000/files/200?key=abcdef&expires=1700000000&user_id=12345';
    const url = SingleDownloader.parseDownloadLink(nxm);
    expect(url).toBe(nxm);
  });

  it('identifies Cloudflare challenges in response text', () => {
    const cfText = '<html><head><title>Just a moment...</title></head><body>cf-turnstile challenge-form</body></html>';
    expect(SingleDownloader.isCloudflareChallenge(cfText)).toBe(true);
    expect(SingleDownloader.isCloudflareChallenge('Normal HTML page')).toBe(false);
  });

  it('detects direct nexus-cdn download URLs with signed tokens', () => {
    const url = 'https://files.nexus-cdn.com/12345/mod.zip?key=abc&expires=1700000000&user_id=1';
    expect(SingleDownloader.isDirectDownloadUrl(url)).toBe(true);
  });

  it('extracts data-download-url from Nexus HTML', () => {
    const html = '<a id="slowDownloadButton" data-download-url="https://files.nexus-cdn.com/x/mod.zip?key=k&amp;expires=1">Slow</a>';
    expect(SingleDownloader.extractDirectDownloadFromText(html)).toBe('https://files.nexus-cdn.com/x/mod.zip?key=k&expires=1');
  });

  it('extracts dl_link input value', () => {
    const html = '<input id="dl_link" value="https://files.nexus-cdn.com/x/mod.zip?key=k&amp;expires=1" />';
    expect(SingleDownloader.extractDirectDownloadFromText(html)).toBe('https://files.nexus-cdn.com/x/mod.zip?key=k&expires=1');
  });

  it('parses mirror array JSON responses with URI key', () => {
    const jsonText = JSON.stringify([{ URI: 'https://files.nexus-cdn.com/mirror/mod.zip?key=abc&expires=999' }]);
    const url = SingleDownloader.parseDownloadURLFromResponse(jsonText);
    expect(url).toBe('https://files.nexus-cdn.com/mirror/mod.zip?key=abc&expires=999');
  });

  it('extracts downloadUrl script assignments', () => {
    const html = '<script>const downloadUrl = "https://files.nexus-cdn.com/script/mod.zip?key=abc&amp;expires=999";</script>';
    expect(SingleDownloader.extractDirectDownloadFromText(html)).toBe('https://files.nexus-cdn.com/script/mod.zip?key=abc&expires=999');
  });

  it('resolves download URLs when gameId is domain name (e.g. stardewvalley) and GraphQL fetches numeric ID 1303', async () => {
    window.history.pushState({}, '', '/stardewvalley/mods/1105');
    const gqlSpy = vi.spyOn(GraphQLClient, 'fetchGameId').mockResolvedValue('1303');

    const mockApiResponse = {
      url: 'https://files.nexus-cdn.com/1303/51105/StardewMod.zip?key=token123&expires=1800000000'
    };

    let requestedBody: string | null = null;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === ENDPOINTS.GENERATE_DOWNLOAD_URL) {
        requestedBody = init?.body ? String(init.body) : '';
        return {
          status: 200,
          text: async () => JSON.stringify(mockApiResponse)
        } as Response;
      }
      return {
        status: 404,
        text: async () => ''
      } as Response;
    });

    const result = await SingleDownloader.resolveDownloadUrl({
      fileId: '51105',
      gameId: 'stardewvalley'
    });

    expect(gqlSpy).toHaveBeenCalledWith('stardewvalley');
    expect(result.url).toBe('https://files.nexus-cdn.com/1303/51105/StardewMod.zip?key=token123&expires=1800000000');
    expect(requestedBody).toContain('fid=51105');
    expect(requestedBody).toContain('game_id=1303');
    expect(requestedBody).toContain('game_name=stardewvalley');
  });

  it('resolves download URLs for Skyrim mod (e.g. file 49397, gameId skyrim -> 110)', async () => {
    window.history.pushState({}, '', '/skyrim/mods/1000');
    const gqlSpy = vi.spyOn(GraphQLClient, 'fetchGameId').mockResolvedValue('110');

    const mockApiResponse = {
      url: 'https://files.nexus-cdn.com/110/49397/SkyrimMod.7z?key=skyrimtoken&expires=1800000000'
    };

    let requestedBody: string | null = null;
    let requestedHeaders: Record<string, string> | undefined;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === ENDPOINTS.GENERATE_DOWNLOAD_URL) {
        requestedBody = init?.body ? String(init.body) : '';
        requestedHeaders = init?.headers as Record<string, string>;
        return {
          status: 200,
          text: async () => JSON.stringify(mockApiResponse)
        } as Response;
      }
      return {
        status: 404,
        text: async () => ''
      } as Response;
    });

    const result = await SingleDownloader.resolveDownloadUrl({
      fileId: '49397',
      gameId: 'skyrim'
    });

    expect(gqlSpy).toHaveBeenCalledWith('skyrim');
    expect(result.url).toBe('https://files.nexus-cdn.com/110/49397/SkyrimMod.7z?key=skyrimtoken&expires=1800000000');
    expect(requestedBody).toContain('fid=49397');
    expect(requestedBody).toContain('game_id=110');
    expect(requestedBody).toContain('game_name=skyrim');
    expect(requestedHeaders?.['X-Requested-With']).toBe('XMLHttpRequest');
  });

  it('resolves download URLs from live DOM element (#slowDownloadButton with data-download-url)', async () => {
    const directCdnUrl = 'https://files.nexus-cdn.com/1303/51105/LiveDOMMod.zip?key=livedomkey&expires=1900000000';
    const slowBtn = document.createElement('a');
    slowBtn.id = 'slowDownloadButton';
    slowBtn.setAttribute('data-download-url', directCdnUrl);
    slowBtn.textContent = 'Slow Download';
    document.body.appendChild(slowBtn);

    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;

    const result = await SingleDownloader.resolveDownloadUrl({
      href: 'https://www.nexusmods.com/stardewvalley/mods/1105?tab=files&file_id=51105'
    });

    expect(result.url).toBe(directCdnUrl);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('resolves download URLs from live DOM input#dl_link', async () => {
    const directCdnUrl = 'https://files.nexus-cdn.com/110/49397/InputMod.7z?key=inputkey&expires=1900000000';
    const input = document.createElement('input');
    input.id = 'dl_link';
    input.value = directCdnUrl;
    document.body.appendChild(input);

    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;

    const result = await SingleDownloader.resolveDownloadUrl({
      href: 'https://www.nexusmods.com/skyrim/mods/1000?tab=files&file_id=49397'
    });

    expect(result.url).toBe(directCdnUrl);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('resolves download URLs when GenerateDownloadUrl returns HTML with dl_link', async () => {
    const htmlResponse = '<div class="download-container"><input id="dl_link" value="https://files.nexus-cdn.com/110/49397/GeneratedHtmlMod.zip?key=htmlkey&amp;expires=1900000000" /></div>';
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === ENDPOINTS.GENERATE_DOWNLOAD_URL) {
        return {
          status: 200,
          text: async () => htmlResponse
        } as Response;
      }
      return { status: 404, text: async () => '' } as Response;
    });

    const result = await SingleDownloader.resolveDownloadUrl({
      fileId: '49397',
      gameId: '110'
    });

    expect(result.url).toBe('https://files.nexus-cdn.com/110/49397/GeneratedHtmlMod.zip?key=htmlkey&expires=1900000000');
  });

  it('resolves NXM download URLs when isNMM is true for GenerateDownloadUrl POST', async () => {
    const nxmUrl = 'nxm://skyrim/mods/1000/files/49397?key=nxmkey123&expires=1900000000&user_id=555';
    let requestedBody = '';

    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === ENDPOINTS.GENERATE_DOWNLOAD_URL) {
        requestedBody = init?.body ? String(init.body) : '';
        return {
          status: 200,
          text: async () => JSON.stringify({ url: nxmUrl })
        } as Response;
      }
      return { status: 404, text: async () => '' } as Response;
    });

    const result = await SingleDownloader.resolveDownloadUrl({
      fileId: '49397',
      gameId: '110',
      isNMM: true
    });

    expect(requestedBody).toContain('nmm=1');
    expect(result.url).toBe(nxmUrl);
  });

  it('extracts download URL from ModRequirementsPopUp widget HTML response with nested buttons', async () => {
    const popUpHtml = `
      <div class="popup-requirements">
        <h3>Mod Requirements</h3>
        <p>This mod requires the following items...</p>
        <div class="btn-group">
          <a id="slowDownloadButton" class="btn" data-download-url="https://files.nexus-cdn.com/popup/nested/StardewExpanded.zip?key=popupKey&amp;expires=2000000000">
            <span>Download</span>
          </a>
        </div>
      </div>
    `;

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === ENDPOINTS.GENERATE_DOWNLOAD_URL) {
        return {
          status: 200,
          text: async () => '{"error": "requires confirmation"}'
        } as Response;
      }
      if (url.includes('ModRequirementsPopUp')) {
        return {
          status: 200,
          text: async () => popUpHtml
        } as Response;
      }
      return {
        status: 404,
        text: async () => ''
      } as Response;
    });

    const result = await SingleDownloader.resolveDownloadUrl({
      fileId: '51105',
      gameId: '1303'
    });

    expect(result.url).toBe('https://files.nexus-cdn.com/popup/nested/StardewExpanded.zip?key=popupKey&expires=2000000000');
  });

  it('extracts NXM URL from ModRequirementsPopUp widget response', async () => {
    const nxmPopUp = '<div><a href="nxm://skyrim/mods/1000/files/49397?key=popupnxmkey&expires=2000000000&user_id=123">Download with Vortex</a></div>';

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === ENDPOINTS.GENERATE_DOWNLOAD_URL) {
        return { status: 200, text: async () => '{"error": "requirements"}' } as Response;
      }
      if (url.includes('ModRequirementsPopUp')) {
        return { status: 200, text: async () => nxmPopUp } as Response;
      }
      return { status: 404, text: async () => '' } as Response;
    });

    const result = await SingleDownloader.resolveDownloadUrl({
      fileId: '49397',
      gameId: '110',
      isNMM: true
    });

    expect(result.url).toBe('nxm://skyrim/mods/1000/files/49397?key=popupnxmkey&expires=2000000000&user_id=123');
  });

  it('falls back to scraping href HTML page when GenerateDownloadUrl and ModRequirementsPopUp fail', async () => {
    const pageHtml = `
      <html>
        <head><title>Files Tab</title></head>
        <body>
          <script>
            const downloadUrl = 'https://files.nexus-cdn.com/1303/51105/ScrapedFromPage.zip?key=pageKey&expires=2100000000';
          </script>
        </body>
      </html>
    `;

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === ENDPOINTS.GENERATE_DOWNLOAD_URL) {
        return { status: 500, text: async () => 'Internal Server Error' } as Response;
      }
      if (url.includes('ModRequirementsPopUp')) {
        return { status: 404, text: async () => 'Not found' } as Response;
      }
      if (url.includes('nexusmods.com/stardewvalley/mods/1105')) {
        return { status: 200, text: async () => pageHtml } as Response;
      }
      return { status: 404, text: async () => '' } as Response;
    });

    const result = await SingleDownloader.resolveDownloadUrl({
      fileId: '51105',
      gameId: '1303',
      href: 'https://www.nexusmods.com/stardewvalley/mods/1105?tab=files&file_id=51105'
    });

    expect(result.url).toBe('https://files.nexus-cdn.com/1303/51105/ScrapedFromPage.zip?key=pageKey&expires=2100000000');
  });

  it('handles nxm:// URLs with special characters and URL parameters', async () => {
    const complexNxm = 'nxm://stardewvalley/mods/1105/files/51105?key=k3y%2B%2F%3Dspecial%24%40&expires=1700000000&user_id=98765&game_id=1303';
    
    // Test parseDownloadLink
    const parsed = SingleDownloader.parseDownloadLink(complexNxm);
    expect(parsed).toBe(complexNxm);

    // Test resolveDownloadUrl
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;

    const result = await SingleDownloader.resolveDownloadUrl({
      href: complexNxm
    });

    expect(result.url).toBe(complexNxm);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('generates download URLs when fileId is extracted from main-file attribute JSON', async () => {
    const container = document.createElement('mod-download-buttons');
    const mainFileJson = {
      id: 51105,
      name: 'Stardew Valley Mod 1.0',
      category_id: 1
    };
    container.setAttribute('main-file', JSON.stringify(mainFileJson));
    document.body.appendChild(container);

    const parsedFileId = JSON.parse(container.getAttribute('main-file') || '{}').id?.toString() || '';
    expect(parsedFileId).toBe('51105');

    const cdnUrl = 'https://files.nexus-cdn.com/1303/51105/MainFileMod.zip?key=mainfilekey&expires=1900000000';
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === ENDPOINTS.GENERATE_DOWNLOAD_URL) {
        return {
          status: 200,
          text: async () => JSON.stringify({ url: cdnUrl })
        } as Response;
      }
      return {
        status: 404,
        text: async () => ''
      } as Response;
    });

    const result = await SingleDownloader.resolveDownloadUrl({
      fileId: parsedFileId,
      gameId: '1303'
    });

    expect(result.url).toBe(cdnUrl);
  });

  it('triggers download manager via chrome.runtime.sendMessage for HTTP download URLs', async () => {
    const directUrl = 'https://files.nexus-cdn.com/1303/51105/Mod.zip?key=abc&expires=999';
    vi.spyOn(SingleDownloader, 'resolveDownloadUrl').mockResolvedValue({ url: directUrl });

    const sendMsgMock = vi.fn();
    const globalObj = globalThis as GlobalWithChrome;
    globalObj.chrome = {
      runtime: {
        sendMessage: sendMsgMock
      }
    };

    const btn = document.createElement('button');
    await SingleDownloader.startDownloadFlow({
      btn,
      fileId: '51105',
      gameId: '1303',
      isNMM: false
    });

    expect(sendMsgMock).toHaveBeenCalledWith({
      type: 'TRIGGER_DOWNLOAD',
      url: directUrl
    });
  });

  it('triggers NXM protocol navigation for nxm:// URLs', async () => {
    const nxmUrl = 'nxm://skyrim/mods/1000/files/49397?key=nxmkey&expires=999';
    vi.spyOn(SingleDownloader, 'resolveDownloadUrl').mockResolvedValue({ url: nxmUrl });

    const originalLocation = window.location;
    const locationMock = { ...originalLocation, href: '' };
    Object.defineProperty(window, 'location', {
      value: locationMock,
      writable: true,
      configurable: true
    });

    const btn = document.createElement('button');
    await SingleDownloader.startDownloadFlow({
      btn,
      fileId: '49397',
      gameId: '110',
      isNMM: true
    });

    expect(window.location.href).toBe(nxmUrl);
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true
    });
  });

  it('resolves primary fileId via GraphQL when fileId is omitted on a mod description page', async () => {
    window.history.pushState({}, '', '/stardewvalley/mods/51105');
    vi.spyOn(GraphQLClient, 'fetchGameId').mockResolvedValue('1303');
    const fileSpy = vi.spyOn(GraphQLClient, 'fetchPrimaryModFileId').mockResolvedValue('99999');

    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === ENDPOINTS.GENERATE_DOWNLOAD_URL) {
        const body = String(init?.body || '');
        expect(body).toContain('fid=99999');
        expect(body).toContain('game_id=1303');
        return {
          status: 200,
          text: async () => JSON.stringify({ url: 'https://files.nexus-cdn.com/1303/99999/Mod.zip?key=abc&expires=999' })
        } as Response;
      }
      return { status: 404, text: async () => '' } as Response;
    });

    const result = await SingleDownloader.resolveDownloadUrl({
      gameId: 'stardewvalley'
    });

    expect(fileSpy).toHaveBeenCalledWith('stardewvalley', 51105);
    expect(result.url).toBe('https://files.nexus-cdn.com/1303/99999/Mod.zip?key=abc&expires=999');
  });

  it('resolves download link from DownloadPopUp widget endpoint', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('Widgets/DownloadPopUp')) {
        return {
          status: 200,
          text: async () => `
            <div class="popup">
              <a id="slowDownloadButton" data-download-url="https://files.nexus-cdn.com/popup/Mod.zip?key=xyz&amp;expires=123">Slow Download</a>
            </div>
          `
        } as Response;
      }
      return { status: 404, text: async () => '' } as Response;
    });

    const result = await SingleDownloader.resolveDownloadUrl({
      fileId: '51105',
      gameId: '1303'
    });

    expect(result.url).toBe('https://files.nexus-cdn.com/popup/Mod.zip?key=xyz&expires=123');
  });

  it('falls back to assigning location when no direct download URL is resolved', async () => {
    vi.spyOn(SingleDownloader, 'resolveDownloadUrl').mockResolvedValue({ url: null, error: 'Could not resolve download link' });

    window.history.pushState({}, '', '/stardewvalley/mods/51105');
    const assignSpy = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, pathname: '/stardewvalley/mods/51105', assign: assignSpy },
      writable: true,
      configurable: true
    });

    const btn = document.createElement('button');
    await SingleDownloader.startDownloadFlow({
      btn,
      fileId: '99999',
      gameId: '1303',
      isNMM: false
    });

    expect(assignSpy).toHaveBeenCalledWith('https://www.nexusmods.com/stardewvalley/mods/51105?tab=files&file_id=99999');

    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true
    });
  });
});
