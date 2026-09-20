import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DownloadManager } from '../../src/background/downloadManager';
import { StorageManager } from '../../src/common/storage';
import { DEFAULT_CONFIG } from '../../src/common/config';
import { ExternalDownloaderMode } from '../../src/common/types';
import { SingleDownloader } from '../../src/content/modules/singleDownloader';

const CDN_URL = 'https://file.nexus-cdn.com/1701234/skyrim/Some%20Mod-12345.7z?Expires=1730000000&Signature=abc';

describe('external downloader', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await StorageManager.setConfig(DEFAULT_CONFIG);
  });

  describe('buildAria2Request', () => {
    it('builds an addUri payload with out set to the filename', () => {
      const req = DownloadManager.buildAria2Request('http://localhost:6800/jsonrpc', '', CDN_URL, 'Some Mod-12345.7z');
      const body = JSON.parse(req.body);

      expect(req.url).toBe('http://localhost:6800/jsonrpc');
      expect(body.jsonrpc).toBe('2.0');
      expect(body.method).toBe('aria2.addUri');
      expect(body.params).toEqual([[CDN_URL], { out: 'Some Mod-12345.7z' }]);
    });

    it('prepends token:<secret> as the first param when a secret is configured', () => {
      const req = DownloadManager.buildAria2Request('http://127.0.0.1:6800/jsonrpc', 'sekrit', CDN_URL, 'mod.7z');
      const body = JSON.parse(req.body);

      expect(body.params).toEqual(['token:sekrit', [CDN_URL], { out: 'mod.7z' }]);
    });

    it('sends an empty options object when no filename is given', () => {
      const req = DownloadManager.buildAria2Request('http://localhost:6800/jsonrpc', '', CDN_URL);
      expect(JSON.parse(req.body).params).toEqual([[CDN_URL], {}]);
    });
  });

  describe('sendToAria2', () => {
    it('resolves the gid on a successful addUri', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        json: async () => ({ result: 'gid-42' })
      } as Response);
      globalThis.fetch = fetchMock;
      await StorageManager.setConfig({
        externalDownloader: { ...DEFAULT_CONFIG.externalDownloader, mode: ExternalDownloaderMode.ARIA2 }
      });

      const result = await DownloadManager.sendToAria2(CDN_URL, 'mod.7z');

      expect(result).toEqual({ success: true, mode: ExternalDownloaderMode.ARIA2, gid: 'gid-42' });
      const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(calledUrl).toBe('http://localhost:6800/jsonrpc');
      expect(init.method).toBe('POST');
      expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
      expect(JSON.parse(String(init.body)).params).toEqual([[CDN_URL], { out: 'mod.7z' }]);
    });

    it('fails with the RPC error message when aria2 rejects the call', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        json: async () => ({ error: { code: 1, message: 'Unauthorized' } })
      } as Response);

      const result = await DownloadManager.sendToAria2(CDN_URL, 'mod.7z');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });

    it('fails without throwing when aria2 is unreachable', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

      const result = await DownloadManager.sendToAria2(CDN_URL, 'mod.7z');

      expect(result).toEqual({ success: false, mode: ExternalDownloaderMode.ARIA2, error: 'aria2 unreachable' });
    });
  });

  describe('dispatchExternalDownload', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    beforeEach(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        configurable: true
      });
    });

    it('copies the URL to the clipboard in clipboard mode', async () => {
      await StorageManager.setConfig({
        externalDownloader: { ...DEFAULT_CONFIG.externalDownloader, enabled: true }
      });
      const fetchMock = vi.fn();
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const result = await DownloadManager.dispatchExternalDownload(CDN_URL, 'mod.7z');

      expect(result).toEqual({ success: true, mode: ExternalDownloaderMode.CLIPBOARD });
      expect(writeText).toHaveBeenCalledWith(CDN_URL);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('POSTs to the configured RPC endpoint in aria2 mode', async () => {
      await StorageManager.setConfig({
        externalDownloader: {
          enabled: true,
          mode: ExternalDownloaderMode.ARIA2,
          rpcUrl: 'http://127.0.0.1:6800/jsonrpc',
          secret: 'sekrit'
        }
      });
      const fetchMock = vi.fn().mockResolvedValue({
        json: async () => ({ result: 'gid-7' })
      } as Response);
      globalThis.fetch = fetchMock;
      writeText.mockClear();

      const result = await DownloadManager.dispatchExternalDownload(CDN_URL, 'mod.7z');

      expect(result).toEqual({ success: true, mode: ExternalDownloaderMode.ARIA2, gid: 'gid-7' });
      expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:6800/jsonrpc');
      expect(writeText).not.toHaveBeenCalled();
    });

    it('refuses to dispatch when the feature is disabled', async () => {
      const result = await DownloadManager.dispatchExternalDownload(CDN_URL, 'mod.7z');

      expect(result.success).toBe(false);
      expect(result.error).toBe('external downloader disabled');
    });
  });

  describe('config persistence', () => {
    it('backfills nested externalDownloader defaults over partial stored config', async () => {
      localStorage.setItem('nextended_config', JSON.stringify({ externalDownloader: { enabled: true } }));

      const config = await StorageManager.getConfig();

      expect(config.externalDownloader.enabled).toBe(true);
      expect(config.externalDownloader.mode).toBe(ExternalDownloaderMode.CLIPBOARD);
      expect(config.externalDownloader.rpcUrl).toBe('http://localhost:6800/jsonrpc');
      expect(config.externalDownloader.secret).toBe('');
    });
  });

  describe('SingleDownloader.extractFilenameFromUrl', () => {
    it('extracts and decodes the file name from a signed CDN URL', () => {
      expect(SingleDownloader.extractFilenameFromUrl(CDN_URL)).toBe('Some Mod-12345.7z');
    });

    it('returns undefined for URLs without a file extension', () => {
      expect(SingleDownloader.extractFilenameFromUrl('https://www.nexusmods.com/skyrim/mods/51105?tab=files')).toBeUndefined();
    });

    it('returns undefined for unparseable URLs', () => {
      expect(SingleDownloader.extractFilenameFromUrl('not a url')).toBeUndefined();
    });
  });
});
