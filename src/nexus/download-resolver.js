import { NexusClient, analyzeResponse } from '../nexus/nexus-client.js';
import { isSafeDownloadUrl, isNexusHost, parseUrlSafe } from '../nexus/url-utils.js';
import {
  urlMentionsRequirements,
  responseMentionsRequirements,
} from '../nexus/requirements.js';
import { ERROR_CODES, NexusDownloadError } from '../shared/errors.js';

export class DownloadResolver {
  constructor(options = {}) {
    this.client = options.client || new NexusClient(options);
  }

  async resolve(fileId, gameId, slug, mode) {
    if (!fileId || !/^\d+$/.test(String(fileId))) {
      throw new NexusDownloadError(ERROR_CODES.INVALID_INPUT, 'Invalid fileId', {
        fileId,
      });
    }
    if (!slug) {
      throw new NexusDownloadError(ERROR_CODES.INVALID_INPUT, 'Missing game slug');
    }
    const m = mode || 'manual';
    if (m !== 'manual' && m !== 'manager') {
      throw new NexusDownloadError(ERROR_CODES.INVALID_INPUT, 'Invalid mode', { mode });
    }

    let result;
    try {
      result = await this.client.generateDownloadUrl(fileId, gameId, slug);
    } catch (e) {
      if (e instanceof NexusDownloadError) throw e;
      throw new NexusDownloadError(
        ERROR_CODES.UNKNOWN,
        e?.message || 'Resolution failed'
      );
    }

    const analysis = analyzeResponse(result);
    if (analysis.code) {
      throw this._wrapFromAnalysis(analysis, fileId, result);
    }

    const uri = this._extractUri(result, m);
    if (!uri) {
      throw new NexusDownloadError(
        ERROR_CODES.FILE_NOT_FOUND,
        'No download URI returned',
        { fileId }
      );
    }

    if (this._isRequirementsUri(uri, result)) {
      throw new NexusDownloadError(ERROR_CODES.REQUIREMENTS, 'Requirements flow', {
        uri,
        fileId,
      });
    }

    const finalUrl = this._normalizeUri(uri);
    if (/^nxm:/i.test(finalUrl)) {
      return { url: finalUrl, protocol: 'nxm:', fileId, mode: m };
    }
    if (!isSafeDownloadUrl(finalUrl)) {
      const host = parseUrlSafe(finalUrl)?.hostname;
      if (
        host &&
        isNexusHost(host) &&
        /^https?:\/\/www\.nexusmods\.com\/[^\s]*requirements/i.test(finalUrl)
      ) {
        throw new NexusDownloadError(ERROR_CODES.REQUIREMENTS, 'Requirements URL', {
          uri: finalUrl,
        });
      }
      throw new NexusDownloadError(ERROR_CODES.INVALID_URL, 'Disallowed redirect host', {
        uri,
        fileId,
      });
    }

    return { url: finalUrl, protocol: parseUrlSafe(finalUrl)?.protocol, fileId, mode: m };
  }

  _extractUri(result) {
    const j = result.json;
    if (j) {
      const data = j.Data || j.data || j;
      if (data) {
        if (data.URI) return data.URI;
        if (data.URI2) return data.URI2;
        if (data.url) return data.url;
        if (data.downloadUrl) return data.downloadUrl;
        if (data.DownloadUrl) return data.DownloadUrl;
      }
      if (j.Destination) return j.Destination;
    }
    const text = String(result.text || '');
    const mUri =
      text.match(/(["'])(https?:\/\/[^\s"']+)(["'])/) ||
      text.match(/uri["'\s:=]+([^"'\s]+)/i);
    if (mUri) return mUri[1] || mUri[2];
    return null;
  }

  _isRequirementsUri(uri, result) {
    if (uriMentionsRequirements(uri)) return true;
    if (responseMentionsRequirements(result.text, result.status, result.headers))
      return true;
    return false;
  }

  _normalizeUri(uri) {
    if (/^nxm:\/\//i.test(uri)) return uri;
    const url = parseUrlSafe(uri);
    if (!url) return null;
    return url.toString();
  }

  _wrapFromAnalysis(analysis, fileId, result) {
    const ctx = { fileId, status: result.status };
    if (analysis.cloudflare) {
      return this._cloudflareError(fileId);
    }
    if (analysis.auth) {
      return new NexusDownloadError(
        ERROR_CODES.AUTH_ERROR,
        'Nexus authentication required',
        ctx
      );
    }
    if (analysis.code === ERROR_CODES.FILE_NOT_FOUND) {
      return new NexusDownloadError(
        ERROR_CODES.FILE_NOT_FOUND,
        'File not found on Nexus',
        ctx
      );
    }
    if (analysis.code === ERROR_CODES.REQUIREMENTS) {
      return new NexusDownloadError(
        ERROR_CODES.REQUIREMENTS,
        'Requirements detected',
        ctx
      );
    }
    return new NexusDownloadError(
      analysis.code || ERROR_CODES.INVALID_RESPONSE,
      'Unexpected response',
      ctx
    );
  }

  _cloudflareError(fileId) {
    return new NexusDownloadError(
      ERROR_CODES.CLOUDFLARE,
      'Nexus requires browser verification (Cloudflare challenge).',
      { fileId, fallback: true }
    );
  }
}

export function uriMentionsRequirements(uri) {
  if (!uri) return false;
  const u = parseUrlSafe(uri);
  if (!u) return urlMentionsRequirements(uri);
  return urlMentionsRequirements(u);
}

export default DownloadResolver;
