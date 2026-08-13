import { isNexusHost, parseUrlSafe } from './url-utils.js';

export const REQUIREMENTS_PATHS = [
  /\/requirements/i,
  /requirement/i,
  /\/files\/required/i,
];

export function urlMentionsRequirements(url) {
  const u = parseUrlSafe(url);
  if (!u) return false;
  return REQUIREMENTS_PATHS.some((re) => re.test(u.pathname + u.search));
}

export function responseMentionsRequirements(text, _status, _headers) {
  if (!text) return false;
  const lower = String(text).toLowerCase();
  if (lower.includes('requirement') || lower.includes('requires you to')) {
    return true;
  }
  if (lower.includes('dependencies')) return true;
  return false;
}

export function isRequirementsError(error) {
  if (!error) return false;
  return error.code === 'REQUIREMENTS' || /requirement/i.test(String(error.message));
}

export function looksLikeRequirementsFlow(url) {
  return urlMentionsRequirements(url) && isNexusHost(new URL(url).hostname);
}
