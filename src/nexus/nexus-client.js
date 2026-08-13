import { buildGenerateDownloadUrl } from './url-utils.js';
import { ERROR_CODES, NexusDownloadError } from '../shared/errors.js';

export class NexusClient {
  constructor(options = {}) {
    this.fetchImpl = options.fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
    this.baseUrl = options.baseUrl || 'https://www.nexusmods.com';
    this.timeout = options.timeout || 30000;
    this.credentials = 'include';
  }

  _controller() {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.timeout);
    return { signal: ac.signal, cancel: () => clearTimeout(timer) };
  }

  async generateDownloadUrl(fileId, gameId, slug) {
    if (!this.fetchImpl) {
      throw new NexusDownloadError(
        ERROR_CODES.NETWORK_ERROR,
        'Fetch API unavailable in this context'
      );
    }
    const url = buildGenerateDownloadUrl(slug, fileId, gameId);
    if (!url) {
      throw new NexusDownloadError(
        ERROR_CODES.INVALID_INPUT,
        'Unable to build download endpoint'
      );
    }

    const { signal, cancel } = this._controller();
    let raw;
    try {
      raw = await this.fetchImpl(url.toString(), {
        method: 'GET',
        credentials: this.credentials,
        redirect: 'follow',
        signal,
        headers: { 'x-requested-with': 'XMLHttpRequest' },
      });
    } catch (e) {
      if (e && e.name === 'AbortError') {
        throw new NexusDownloadError(ERROR_CODES.TIMEOUT, 'Request timed out');
      }
      throw new NexusDownloadError(
        ERROR_CODES.NETWORK_ERROR,
        e?.message || 'Network error'
      );
    } finally {
      cancel();
    }

    return this._processResponse(raw);
  }

  async _processResponse(response) {
    const result = {
      status: response.status,
      ok: response.ok,
      headers: this._headers(response.headers),
      body: null,
      json: null,
      text: null,
    };
    const bodyText = await response.text();
    result.text = bodyText;
    if (bodyText) {
      try {
        result.json = JSON.parse(bodyText);
      } catch {
        result.json = null;
      }
    }
    return result;
  }

  _headers(headers) {
    const out = {};
    if (!headers) return out;
    try {
      for (const [k, v] of headers.entries()) {
        out[k.toLowerCase()] = v;
      }
    } catch {
      return out;
    }
    return out;
  }
}

export function analyzeResponse(result) {
  const cfRay =
    result.headers &&
    (result.headers['cf-ray'] || result.headers['server'] === 'cloudflare');
  const text = String(result.text || '');
  const isHtml =
    result.headers && /text\/html/i.test(result.headers['content-type'] || '');

  if (!result.ok && (result.status === 403 || (result.status === 503 && cfRay))) {
    return { code: ERROR_CODES.CLOUDFLARE, cloudflare: true };
  }

  if (isHtml && /<title[^>]*>.*cloudflare|^Just a moment|cf-challenge/i.test(text)) {
    return { code: ERROR_CODES.CLOUDFLARE, cloudflare: true };
  }

  if (
    result.status === 401 ||
    /^https:\/\/(?:www\.)?nexusmods\.com\/.*[?&]returnurl=/i.test(text)
  ) {
    return { code: ERROR_CODES.AUTH_ERROR, auth: true };
  }

  if (/login|sign in/i.test(text) && isHtml) {
    return { code: ERROR_CODES.AUTH_ERROR, auth: true };
  }

  if (result.status === 404) {
    return { code: ERROR_CODES.FILE_NOT_FOUND };
  }

  if (result.json) {
    if (Array.isArray(result.json.messages) && result.json.messages.length) {
      const msg = String(result.json.messages[0].message || result.json.messages[0]);
      if (/require/i.test(msg)) return { code: ERROR_CODES.REQUIREMENTS };
    }
  }

  return { code: null, cloudflare: false, auth: false };
}
