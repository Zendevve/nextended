import { URL_SCHEME_HTTPS, NEXUS_HOSTS, CDN_HOSTS } from '../shared/constants.js';

export function isString(value) {
  return typeof value === 'string';
}

export function isNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isIntString(value) {
  return isString(value) && /^-?\d+$/.test(value.trim());
}

export function toIntSafe(value) {
  if (isNumber(value)) return Math.trunc(value);
  if (isString(value)) {
    const n = Number(value.trim());
    if (Number.isFinite(n) && /^\d+$/.test(value.trim())) return n;
  }
  return null;
}

export function extractSlugFromPathname(pathname) {
  if (!isString(pathname)) return null;
  const parts = pathname.split('/').filter(Boolean);
  return parts[0] || null;
}

export function extractGameIdValue(str) {
  if (!isString(str)) return null;
  const m = str.match(/\b(\d{1,7})\b/);
  return m ? m[1] : null;
}

export function extractFileIdValue(value) {
  if (isNumber(value)) return toIntString(value);
  const s = isString(value) ? value.trim() : '';
  if (/^\d+$/.test(s)) return s;
  const m = s.match(/(\d+)/);
  return m ? m[1] : null;
}

function toIntString(value) {
  return Number(value).toString();
}

export function extractFileIdFromUrl(searchParams) {
  if (!searchParams) return null;
  const id = searchParams.get('file_id') || searchParams.get('fileId');
  return id || null;
}

export function isNexusHost(host) {
  if (!host) return false;
  const h = host.toLowerCase();
  return NEXUS_HOSTS.some((root) => h === root || h.endsWith('.' + root));
}

export function isCdnHost(host) {
  if (!host) return false;
  const h = host.toLowerCase();
  return CDN_HOSTS.some((root) => h === root || h.endsWith('.' + root));
}

export function isAllowedHost(host) {
  return isNexusHost(host) || isCdnHost(host);
}

export function parseUrlSafe(value) {
  if (!isString(value)) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

export function isSafeDownloadUrl(value) {
  const url = parseUrlSafe(value);
  if (!url) return false;
  if (url.protocol !== URL_SCHEME_HTTPS) return false;
  return isAllowedHost(url.hostname);
}

export function buildGenerateDownloadUrl(slug, fileId, gameId) {
  if (!slug || !fileId) return null;
  const base = `https://www.nexusmods.com/${encodeURIComponent(slug)}`;
  const params = new URLSearchParams({
    file_id: String(fileId),
  });
  if (gameId) params.set('game_id', String(gameId));
  return `${base}/Core/Downloads/GenerateDownloadUrl?${params.toString()}`;
}

export function buildFilePageUrl(slug, modId, fileId) {
  if (!slug || !modId) return null;
  const url = new URL(
    `https://www.nexusmods.com/${encodeURIComponent(slug)}/mods/${encodeURIComponent(modId)}`
  );
  url.searchParams.set('tab', 'files');
  if (fileId) url.searchParams.set('file_id', String(fileId));
  return url.toString();
}

export function isArchivedQuery(searchParams) {
  if (!searchParams) return false;
  return searchParams.get('category') === 'archived';
}
