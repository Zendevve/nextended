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
  const id = searchParams.get('file_id') || searchParams.get('fileId') || searchParams.get('id');
  return id || null;
}

export function extractSlugAndModId(urlOrPath) {
  if (typeof urlOrPath !== 'string' || !urlOrPath) return { slug: null, modId: null };
  const pathname = urlOrPath.startsWith('http') ? parseUrlSafe(urlOrPath)?.pathname || '' : urlOrPath;
  const match = pathname.match(/^\/([a-zA-Z0-9_-]+)\/mods\/(\d+)/i);
  if (!match) return { slug: null, modId: null };
  return { slug: match[1], modId: match[2] };
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
  if (gameId && gameId !== '0' && gameId !== 0 && String(gameId).trim() !== '') {
    params.set('game_id', String(gameId));
  }
  return `${base}/Core/Downloads/GenerateDownloadUrl?${params.toString()}`;
}

export function setNexusAdBypassCookie(doc = typeof document !== 'undefined' ? document : null) {
  if (!doc) return;
  try {
    const now = Math.round(Date.now() / 1000);
    const expirySeconds = 5 * 60;
    const expiryTimestamp = now + expirySeconds;
    const expiryDate = new Date(Date.now() + expirySeconds * 1000).toUTCString();
    const isNexus = typeof window !== 'undefined' && window.location?.hostname?.includes('nexusmods.com');
    const domainPart = isNexus ? ';domain=nexusmods.com' : '';
    doc.cookie = `ab=0|${expiryTimestamp};expires=${expiryDate}${domainPart};path=/`;
  } catch {
    // Ignore in sandboxed contexts
  }
}
export function isCloudflareChallenge(text = '', status = 200, headers = '') {
  if (!text && status !== 403 && status !== 503) return false;
  const str = String(text);
  if (
    /cf-turnstile|challenges\.cloudflare\.com|Just a moment\.\.\.|Attention Required!|cf-error-details|id="challenge-form"|cf-browser-verification|window\._cf_chl_opt/i.test(
      str
    )
  ) {
    return true;
  }
  const headerStr = typeof headers === 'string' ? headers : JSON.stringify(headers || '');
  if (
    (status === 403 || status === 503) &&
    /cf-ray|cloudflare/i.test(headerStr) &&
    str.trim().startsWith('<')
  ) {
    return true;
  }
  return false;
}

export function isAccountSuspended(text = '') {
  return /Your access to Nexus Mods has been temporarily suspended/i.test(String(text));
}

export function isLoginRequired(text = '') {
  return (
    /class="replaced-login-link"/i.test(String(text)) ||
    /users\.nexusmods\.com\/auth\/continue/i.test(String(text))
  );
}

export function sanitizeFilename(name) {
  if (!name) return 'nexus_download';
  return String(name)
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    .replace(/^\.+/, '')
    .trim() || 'nexus_download';
}

