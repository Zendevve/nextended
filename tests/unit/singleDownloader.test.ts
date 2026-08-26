import { describe, it, expect } from 'vitest';
import { SingleDownloader } from '../../src/content/modules/singleDownloader';

describe('SingleDownloader URL Resolution Logic', () => {
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
    const nxm = 'nxm://skyrim/mods/100/files/200?key=abcdef&expires=1700000000&user_id=12345';
    const url = SingleDownloader.parseDownloadLink(nxm);
    expect(url).toBe(nxm);
  });

  it('identifies Cloudflare challenges in response text', () => {
    const cfText = '<html><head><title>Just a moment...</title></head><body>cf-turnstile challenge-form</body></html>';
    expect(SingleDownloader.isCloudflareChallenge(cfText)).toBe(true);
    expect(SingleDownloader.isCloudflareChallenge('Normal HTML page')).toBe(false);
  });
});
