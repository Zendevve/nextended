import { parseFileIdFromElement, parseFileName } from '../nexus/file-parser.js';
import { extractGameInfo } from '../nexus/game-parser.js';
import {
  isArchivedQuery,
  extractSlugFromPathname,
  buildFilePageUrl,
} from '../nexus/url-utils.js';
import { createLogger } from '../shared/logger.js';

const log = createLogger('detector');

const NEXUS_PAGE_REGEX = /^https:\/\/(?:www\.)?nexusmods\.com\//i;

export function isNexusModPage(location) {
  if (!location) return false;
  const href = location.href || (typeof location === 'string' ? location : '');
  if (!NEXUS_PAGE_REGEX.test(href)) return false;
  const pathname = location.pathname || '';
  return pathname.indexOf('/mods/') !== -1;
}

export function isArchivePage(location) {
  if (!location) return false;
  if (!isNexusModPage(location)) return false;
  const search = location.search || '';
  if (isArchivedQuery(new URLSearchParams(search))) return true;
  const href = (location.href || '').toLowerCase();
  return href.indexOf('category=archived') !== -1;
}

export function findArchivedFiles(document, location) {
  if (!document || !location || !isArchivePage(location)) return [];

  const info = extractGameInfo(document, location);
  const gameId = info.gameId;
  const slug = info.gameSlug || extractSlugFromPathname(location.pathname || '');
  const modId = info.modId;

  const candidates = collectCandidateElements(document);
  const seen = new Set();
  const files = [];

  for (const el of candidates) {
    const fileId = parseFileIdFromElement(el);
    if (!fileId || seen.has(fileId)) continue;
    seen.add(fileId);
    files.push({
      fileId,
      gameId,
      gameSlug: slug,
      modId,
      name: parseFileName(el) || guessName(el),
      element: el,
      fallbackUrl: buildFilePageUrl(slug, modId, fileId),
    });
  }

  log.info('Archived files located', { count: files.length, gameId, gameSlug: slug });
  return files;
}

function collectCandidateElements(document) {
  const selectors = [
    '.file-expander-header[data-id]',
    '[data-file-id]',
    'tr[data-id] .file-link',
    'tr[data-id]',
    '.file-row[data-id]',
    '.fileContainer[data-id]',
  ];
  const found = [];
  for (const sel of selectors) {
    const nodes = document.querySelectorAll ? document.querySelectorAll(sel) : [];
    for (const node of nodes) {
      if (node.nodeType === 1) found.push(node);
    }
  }

  const linkNodes = document.querySelectorAll('a[href*="file_id="], a[href*="/files/"]');
  for (const a of linkNodes) {
    if (!a.parentNode || a.closest('[data-nxdt="true"]')) continue;
    if (found.includes(a)) continue;
    found.push(a);
  }

  return found;
}

function guessName(el) {
  const text = el.textContent || '';
  const m = text.match(/.+?(?=\s{2,}|$)/);
  return (m && m[0]) || text.trim().slice(0, 40) || 'archived file';
}
