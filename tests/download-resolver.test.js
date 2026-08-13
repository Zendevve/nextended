import { describe, it, expect } from 'vitest';
import { DownloadResolver } from '../src/nexus/download-resolver.js';
import { ERROR_CODES } from '../src/shared/errors.js';

class StubClient {
  constructor(responses = []) {
    this.responses = [...responses];
    this.calls = [];
  }
  async generateDownloadUrl(fileId, gameId, slug) {
    this.calls.push({ fileId, gameId, slug });
    if (this.responses.length) return this.responses.shift();
    throw new Error('no stub response');
  }
}

function jsonResp(json, opts = {}) {
  return {
    status: opts.status || 200,
    ok: opts.ok !== undefined ? opts.ok : true,
    headers: opts.headers || {},
    text: json ? JSON.stringify(json) : '',
    json: json,
  };
}

describe('download-resolver', () => {
  it('resolves a manual CDN URL', async () => {
    const client = new StubClient([
      jsonResp({ Data: { URI: 'https://files.nexus-cdn.com/x/file.7z?token=t' } }),
    ]);
    const r = new DownloadResolver({ client });
    const out = await r.resolve('123456', '1704', 'skyrimspecialedition', 'manual');
    expect(out.url).toContain('files.nexus-cdn.com');
    expect(out.protocol).toBe('https:');
    expect(out.mode).toBe('manual');
  });

  it('resolves an NXM manager URL', async () => {
    const client = new StubClient([
      jsonResp({ Data: { URI: 'nxm://skyrimspecialedition/mods/42?pid=42&fid=123456' } }),
    ]);
    const r = new DownloadResolver({ client });
    const out = await r.resolve('123456', '1704', 'skyrimspecialedition', 'manager');
    expect(out.protocol).toBe('nxm:');
    expect(out.action).toBeUndefined();
  });

  it('throws REQUIREMENTS when URI mentions requirements', async () => {
    const client = new StubClient([
      jsonResp({
        Data: { URI: 'https://www.nexusmods.com/skymod/mods/42/requirements' },
      }),
    ]);
    const r = new DownloadResolver({ client });
    await expect(r.resolve('1', '1', 'skymod', 'manual')).rejects.toMatchObject({
      code: ERROR_CODES.REQUIREMENTS,
    });
  });

  it('detects Cloudflare challenge (status 503 + server)', async () => {
    const client = new StubClient([
      {
        status: 503,
        ok: false,
        headers: { server: 'cloudflare', 'content-type': 'text/html' },
        text: '<html>Just a moment</html>',
        json: null,
      },
    ]);
    const r = new DownloadResolver({ client });
    await expect(r.resolve('1', '1', 'skymod', 'manual')).rejects.toMatchObject({
      code: ERROR_CODES.CLOUDFLARE,
    });
  });

  it('detects auth errors (401)', async () => {
    const client = new StubClient([
      { status: 401, ok: false, headers: {}, text: 'login', json: null },
    ]);
    const r = new DownloadResolver({ client });
    await expect(r.resolve('1', '1', 'skymod', 'manual')).rejects.toMatchObject({
      code: ERROR_CODES.AUTH_ERROR,
    });
  });

  it('detects file not found (404)', async () => {
    const client = new StubClient([
      { status: 404, ok: false, headers: {}, text: 'not found', json: null },
    ]);
    const r = new DownloadResolver({ client });
    await expect(r.resolve('1', '1', 'skymod', 'manual')).rejects.toMatchObject({
      code: ERROR_CODES.FILE_NOT_FOUND,
    });
  });

  it('throws INVALID_URL for disallowed host', async () => {
    const client = new StubClient([
      jsonResp({ Data: { URI: 'https://evil.example/file.zip' } }),
    ]);
    const r = new DownloadResolver({ client });
    await expect(r.resolve('1', '1', 'skymod', 'manual')).rejects.toMatchObject({
      code: ERROR_CODES.INVALID_URL,
    });
  });

  it('throws FILE_NOT_FOUND when no URI returned', async () => {
    const client = new StubClient([jsonResp({})]);
    const r = new DownloadResolver({ client });
    await expect(r.resolve('1', '1', 'skymod', 'manual')).rejects.toMatchObject({
      code: ERROR_CODES.FILE_NOT_FOUND,
    });
  });

  it('throws INVALID_INPUT for non-numeric fileId', async () => {
    const r = new DownloadResolver({ client: new StubClient([]) });
    await expect(r.resolve('abc', '1', 'skymod', 'manual')).rejects.toMatchObject({
      code: ERROR_CODES.INVALID_INPUT,
    });
  });

  it('throws INVALID_INPUT for missing slug', async () => {
    const r = new DownloadResolver({ client: new StubClient([]) });
    await expect(r.resolve('1', '1', '', 'manual')).rejects.toMatchObject({
      code: ERROR_CODES.INVALID_INPUT,
    });
  });
});
