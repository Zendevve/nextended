import {
  MESSAGE_TYPES,
  STORAGE_KEY_COLLECTION_HISTORY,
} from '../shared/constants.js';
import { incrementStat } from '../storage/stats.js';
import { DEFAULT_SETTINGS } from '../storage/defaults.js';
import { ERROR_CODES, NexusDownloadError } from '../shared/errors.js';
import { createLogger } from '../shared/logger.js';
import { parseUrlSafe, isSafeDownloadUrl, buildGenerateDownloadUrl } from '../nexus/url-utils.js';
import { registerHandler } from './message-router.js';

const log = createLogger('handlers');

const NXM_SCHEME = 'nxm:';
const NXM_URL_PATTERN = /^nxm:\/\/[^\s/]+(?:\/|$)/i;
const COLLECTION_DOWNLOAD_ENDPOINT =
  'https://www.nexusmods.com/Core/Libs/Common/Managers/Downloads?GenerateDownloadUrl';
const SLUG_PATTERN = /^[a-zA-Z0-9_-]+$/;
const FILE_ID_PATTERN = /^\d+$/;
function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => {
    clearTimeout(timer);
  });
}

function isValidDownloadUrl(value) {
  const parsed = parseUrlSafe(value);
  if (parsed && parsed.protocol === NXM_SCHEME) {
    return NXM_URL_PATTERN.test(value);
  }
  return isSafeDownloadUrl(value);
}

function extractUrlFromData(data) {
  if (!data) return null;
  if (typeof data === 'string') {
    const trimmed = data.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('nxm://')) {
      return trimmed;
    }
    return null;
  }
  if (Array.isArray(data)) {
    for (const item of data) {
      const u = extractUrlFromData(item);
      if (u) return u;
    }
    return null;
  }
  if (typeof data === 'object') {
    return (
      data.url ||
      data.URL ||
      data.Url ||
      data.URI ||
      data.uri ||
      data.directUrl ||
      data.direct_url ||
      data.downloadUrl ||
      data.download_url ||
      extractUrlFromData(data.data) ||
      extractUrlFromData(data.result) ||
      extractUrlFromData(data.files) ||
      extractUrlFromData(data.servers) ||
      null
    );
  }
  return null;
}

async function extractValidatedUrl(response) {
  const text = await response.text();
  if (response.status === 404) {
    throw new NexusDownloadError(ERROR_CODES.FILE_NOT_FOUND, 'File not found');
  }
  if (/cloudflare|cf-/i.test(text)) {
    throw new NexusDownloadError(ERROR_CODES.CLOUDFLARE, 'Blocked by Cloudflare challenge');
  }
  if (response.status === 429) {
    throw new NexusDownloadError(ERROR_CODES.RATE_LIMITED, 'Rate limited by Nexus Mods');
  }
  if (/Your access to Nexus Mods has been temporarily suspended/i.test(text)) {
    throw new NexusDownloadError(
      ERROR_CODES.ACCOUNT_SUSPENDED,
      'Account temporarily suspended by Nexus Mods (10-minute cooldown)'
    );
  }
  if (response.status === 403 || /class="replaced-login-link"/i.test(text)) {
    throw new NexusDownloadError(ERROR_CODES.AUTH_ERROR, 'Authentication required on Nexus Mods');
  }
  if (response.status >= 400) {
    throw new NexusDownloadError(
      ERROR_CODES.UNKNOWN,
      `Nexus responded with status ${response.status}`
    );
  }

  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  let url = extractUrlFromData(json);
  if (!url && text) {
    const unescapedText = text.replace(/\\\//g, '/').replace(/&amp;/g, '&');
    // Regex patterns from NDC & NNW++
    const patterns = [
      /const downloadUrl = '([^']+)'/i,
      /id="slowDownloadButton"[^>]*data-download-url="([^"]+)"/i,
      /data-download-url="([^"]+)"/i,
      /download-url="([^"]+)"/i,
      /"(?:url|downloadUrl|URI|src)"\s*:\s*"([^"]+)"/i,
      /nxm:\/\/[^\s"'<>]+/i,
      /https?:\/\/[a-zA-Z0-9-]+\.nexus-cdn\.com[^\s"'<>]+/i,
      /https?:\/\/[^\s"'<>]+/i,
    ];

    for (const pattern of patterns) {
      const match = unescapedText.match(pattern);
      if (match) {
        const cand = (match[1] || match[0]).trim();
        if (isValidDownloadUrl(cand)) {
          url = cand;
          break;
        }
      }
    }
  }
  if (!url) return null;

  const cleaned = String(url).replace(/&amp;/g, '&');
  if (!isValidDownloadUrl(cleaned)) {
    throw new NexusDownloadError(ERROR_CODES.INVALID_URL, 'Download URL is not from an allowed host');
  }
  return cleaned;
}
function resolveFailure(error) {
  if (error && error.name === 'AbortError') {
    return { url: null, error: 'Request timed out', code: ERROR_CODES.TIMEOUT };
  }
  if (error instanceof NexusDownloadError) {
    return { url: null, error: error.message, code: error.code };
  }
  return { url: null, error: error?.message || 'Network error', code: ERROR_CODES.NETWORK_ERROR };
}

export function isTrustedSender(sender, runtimeId) {
  if (!sender || typeof sender !== 'object' || !runtimeId) return false;
  if (sender.id !== runtimeId) return false;
  const url = sender.url;
  if (!url) return false;
  if (url.startsWith(`chrome-extension://${runtimeId}`)) return true;
  const parsed = parseUrlSafe(url);
  return (
    parsed !== null &&
    parsed.protocol === 'https:' &&
    parsed.hostname === 'www.nexusmods.com'
  );
}

export async function settingsChanged(deps = {}) {
  await deps.refreshClients?.();
  return { ok: true };
}

export async function fetchCollectionRevisions(payload, deps = {}) {
  const client = deps.getCollectionClient();
  const revisions = await client.fetchRevisions(payload.gameDomain, payload.collectionSlug);
  return { revisions };
}

export async function fetchCollectionMods(payload, deps = {}) {
  const client = deps.getCollectionClient();
  const data = await client.fetchMods(payload.gameDomain, payload.collectionSlug, payload.revision);
  return { collectionRevision: data };
}

export async function fetchModRequirements(payload, deps = {}) {
  const client = deps.getCollectionClient();
  const modData = await client.fetchModRequirements(payload.gameDomain, payload.modId);
  return { mod: modData };
}

let historyCache = null;
let historyLoadPromise = null;
let historyWriteChain = Promise.resolve();

async function loadHistoryCache() {
  if (historyCache) return historyCache;
  if (!historyLoadPromise) {
    historyLoadPromise = (async () => {
      const stored = await chrome.storage.local.get(STORAGE_KEY_COLLECTION_HISTORY);
      historyCache = stored[STORAGE_KEY_COLLECTION_HISTORY] || Object.create(null);
      return historyCache;
    })();
  }
  return historyLoadPromise;
}

function persistHistory() {
  const snapshot = historyCache;
  historyWriteChain = historyWriteChain
    .then(() => chrome.storage.local.set({ [STORAGE_KEY_COLLECTION_HISTORY]: snapshot }))
    .catch((e) => {
      log.error('Failed to persist collection history', { error: e?.message });
    });
  return historyWriteChain;
}

export async function getCollectionHistory() {
  const history = await loadHistoryCache();
  return { history };
}

const HISTORY_KEY_BLOCKLIST = /^(__proto__|constructor|prototype)$/;

function dedupeFileIds(fileIds) {
  const seen = new Set();
  const out = [];
  for (const fileId of fileIds) {
    const id = String(fileId);
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

export async function setCollectionHistory(payload) {
  const { gameDomain, collectionSlug, type, fileIds, replace } = payload || {};
  if (!gameDomain || !collectionSlug || !type || !Array.isArray(fileIds)) {
    return { ok: false, error: 'Invalid history payload', code: ERROR_CODES.INVALID_INPUT };
  }
  if (replace !== undefined && typeof replace !== 'boolean') {
    return { ok: false, error: 'Invalid history payload', code: ERROR_CODES.INVALID_INPUT };
  }
  if (
    HISTORY_KEY_BLOCKLIST.test(gameDomain) ||
    HISTORY_KEY_BLOCKLIST.test(collectionSlug) ||
    HISTORY_KEY_BLOCKLIST.test(type)
  ) {
    return { ok: false, error: 'Invalid history payload', code: ERROR_CODES.INVALID_INPUT };
  }
  const history = await loadHistoryCache();
  let game = Object.hasOwn(history, gameDomain) ? history[gameDomain] : null;
  if (!game) {
    game = Object.create(null);
    history[gameDomain] = game;
  }
  let collection = Object.hasOwn(game, collectionSlug) ? game[collectionSlug] : null;
  if (!collection) {
    collection = Object.create(null);
    game[collectionSlug] = collection;
  }
  const ids = dedupeFileIds(fileIds);
  if (replace === true) {
    collection[type] = ids;
  } else {
    const list = Object.hasOwn(collection, type) ? collection[type] : [];
    for (const id of ids) {
      if (!list.includes(id)) list.push(id);
    }
    collection[type] = list;
  }
  await persistHistory();
  return { ok: true };
}

export function resetHistoryCache() {
  historyCache = null;
  historyLoadPromise = null;
  historyWriteChain = Promise.resolve();
}

export async function startDownload(payload) {
  if (!payload?.url) {
    return { success: false, error: 'Missing download URL', code: ERROR_CODES.INVALID_INPUT };
  }
  if (!isSafeDownloadUrl(payload.url)) {
    return { success: false, error: 'Download URL is not from an allowed host', code: ERROR_CODES.INVALID_URL };
  }
  if (!chrome.downloads || typeof chrome.downloads.download !== 'function') {
    return { success: false, error: 'chrome.downloads API unavailable', code: ERROR_CODES.UNKNOWN };
  }
  const parsed = parseUrlSafe(payload.url);
  return new Promise((resolve) => {
    chrome.downloads.download({ url: payload.url, saveAs: false }, async (downloadId) => {
      if (chrome.runtime.lastError) {
        log.error('chrome.downloads failed', { error: chrome.runtime.lastError.message });
        resolve({ success: false, error: chrome.runtime.lastError.message, code: ERROR_CODES.UNKNOWN });
        return;
      }
      try {
        await incrementStat('autoDownloadsCompleted', 1);
      } catch {
        /* stats are best-effort */
      }

      log.info('chrome.downloads started', {
        dlId: downloadId,
        host: parsed?.hostname || null,
        fileId: parsed?.searchParams?.get('file_id') || null,
      });
      resolve({ success: true, downloadId });
    });
  });
}

export async function resolveCollectionDownload(payload, _deps = {}) {
  const { fileId, gameId, gameDomain, isNMM, modId, uri } = payload || {};
  if (!fileId || typeof fileId !== 'string' || !FILE_ID_PATTERN.test(fileId.trim())) {
    return { url: null, error: 'Invalid fileId', code: ERROR_CODES.INVALID_INPUT };
  }
  const timeout = DEFAULT_SETTINGS.requestTimeout || 30000;
  const bodyParts = [`fid=${encodeURIComponent(fileId)}`];
  if (gameId && gameId !== '0' && gameId !== 0 && String(gameId).trim() !== '') {
    bodyParts.push(`game_id=${encodeURIComponent(gameId)}`);
  }
  if (isNMM) {
    bodyParts.push('nmm=1');
  }
  const body = bodyParts.join('&');
  let primaryError = null;
  try {
    const response = await fetchWithTimeout(
      COLLECTION_DOWNLOAD_ENDPOINT,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          Origin: 'https://www.nexusmods.com',
        },
        body,
        credentials: 'include',
      },
      timeout
    );
    const url = await extractValidatedUrl(response);
    if (url) return { url, fileId };
  } catch (e) {
    primaryError = e;
  }

  // Fallback 1: Try standard game-specific GenerateDownloadUrl endpoint
  if (gameDomain && typeof gameDomain === 'string' && SLUG_PATTERN.test(gameDomain)) {
    try {
      const endpoint = `${buildGenerateDownloadUrl(gameDomain, fileId, gameId)}${isNMM ? '&nmm=1' : ''}`;
      const response = await fetchWithTimeout(
        endpoint,
        {
          method: 'GET',
          headers: {
            'X-Requested-With': 'XMLHttpRequest',
            Origin: 'https://www.nexusmods.com',
          },
          credentials: 'include',
        },
        timeout
      );
      const url = await extractValidatedUrl(response);
      if (url) return { url, fileId };
    } catch (e) {
      if (!primaryError) primaryError = e;
    }
  }

  // Fallback 2: Direct URI if supplied by GraphQL and valid
  if (uri && typeof uri === 'string' && isSafeDownloadUrl(uri)) {
    return { url: uri, fileId };
  }

  // Fallback 3: NXM URL for Vortex / MO2 mode
  if (isNMM && gameDomain && modId) {
    return { url: `nxm://${gameDomain}/mods/${modId}/files/${fileId}`, fileId };
  }
  if (isNMM) {
    return { url: null, error: 'Missing modId for NMM download', code: ERROR_CODES.INVALID_URL };
  }
  if (primaryError) {
    return resolveFailure(primaryError);
  }
  return { url: null, error: 'No download URL returned from Nexus', code: ERROR_CODES.INVALID_RESPONSE };
}

export async function resolveArchivedDownload(payload, _deps = {}) {
  const { fileId, slug, isNMM } = payload || {};
  if (
    !fileId ||
    !slug ||
    typeof slug !== 'string' ||
    !SLUG_PATTERN.test(slug) ||
    typeof fileId !== 'string' ||
    !FILE_ID_PATTERN.test(fileId.trim())
  ) {
    return { url: null, error: 'Invalid fileId or slug', code: ERROR_CODES.INVALID_INPUT };
  }
  const timeout = DEFAULT_SETTINGS.requestTimeout || 30000;
  const endpoint = `${buildGenerateDownloadUrl(slug, fileId)}${isNMM ? '&nmm=1' : ''}`;
  try {
    const response = await fetchWithTimeout(
      endpoint,
      {
        method: 'GET',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'include',
      },
      timeout
    );
    const url = await extractValidatedUrl(response);
    if (url) return { url, fileId };
    return { url: null, error: 'No download URL returned from Nexus', code: ERROR_CODES.INVALID_RESPONSE };
  } catch (e) {
    return resolveFailure(e);
  }
}

export async function resolveModDownload(payload, deps = {}) {
  const { fileId, gameDomain, modId, isNMM, href, gameId } = payload || {};
  if (!fileId && !href) {
    return { url: null, error: 'Missing fileId or href', code: ERROR_CODES.INVALID_INPUT };
  }
  if (href && href.startsWith('nxm://')) {
    return { url: href, fileId };
  }
  return resolveCollectionDownload(
    {
      fileId: String(fileId || ''),
      gameId: String(gameId || '0'),
      gameDomain: gameDomain || '',
      isNMM: !!isNMM,
      modId: String(modId || ''),
    },
    deps
  );
}

export async function collectionFinished() {
  try {
    await incrementStat('collectionsDownloaded', 1);
  } catch {
    /* stats are best-effort */
  }
  return { ok: true };
}


export async function verifyCollectionDownloads(payload) {
  const { gameDomain, collectionSlug, modFiles = [] } = payload || {};
  const history = await loadHistoryCache();
  const gameHistory = (gameDomain && collectionSlug && history[gameDomain]?.[collectionSlug]) || {};
  const historyIds = new Set([
    ...(gameHistory.all || []),
    ...(gameHistory.mandatory || []),
    ...(gameHistory.optional || []),
  ]);

  let browserDownloads = [];
  if (typeof chrome !== 'undefined' && chrome.downloads && typeof chrome.downloads.search === 'function') {
    try {
      browserDownloads = await new Promise((resolve) => {
        chrome.downloads.search({}, (items) => {
          void chrome.runtime?.lastError;
          resolve(items || []);
        });
      });
    } catch {
      browserDownloads = [];
    }
  }

  const results = modFiles.map((mod) => {
    const fileId = String(mod.fileId || mod.file?.fileId || '');
    const fileName = mod.fileName || mod.file?.name || '';
    const modName = mod.modName || mod.file?.mod?.name || 'Unknown Mod';

    const inHistory = historyIds.has(fileId);

    const matchingDl = browserDownloads.find((dl) => {
      if (!dl) return false;
      const dlFilename = dl.filename ? dl.filename.toLowerCase() : '';
      const targetName = fileName.toLowerCase();
      if (targetName && (dlFilename.endsWith(targetName) || dlFilename.includes(targetName))) {
        return true;
      }
      if (fileId && dl.url && (dl.url.includes(`file_id=${fileId}`) || dl.url.includes(`fid=${fileId}`))) {
        return true;
      }
      return false;
    });

    const isComplete = (matchingDl && matchingDl.state === 'complete') || inHistory;
    const isInterrupted = matchingDl && matchingDl.state === 'interrupted';
    const isInProgress = matchingDl && matchingDl.state === 'in_progress';

    return {
      fileId,
      fileName,
      modName,
      modId: mod.modId || mod.file?.mod?.modId || '',
      fileSize: mod.fileSize || mod.file?.size || 0,
      isOptional: !!mod.optional,
      confirmed: isComplete,
      state: isComplete ? 'complete' : isInProgress ? 'in_progress' : isInterrupted ? 'interrupted' : 'missing',
      downloadPath: matchingDl?.filename || null,
      fileSizeDownloaded: matchingDl?.bytesReceived || matchingDl?.fileSize || null,
    };
  });

  const total = results.length;
  const confirmed = results.filter((r) => r.confirmed).length;
  const missing = results.filter((r) => !r.confirmed).length;

  return {
    total,
    confirmed,
    missing,
    percentage: total > 0 ? Math.round((confirmed / total) * 100) : 0,
    results,
  };
}

export function registerHandlers(deps = {}) {
  registerHandler(MESSAGE_TYPES.FETCH_COLLECTION_REVISIONS, (payload) =>
    fetchCollectionRevisions(payload, deps)
  );
  registerHandler(MESSAGE_TYPES.FETCH_COLLECTION_MODS, (payload) =>
    fetchCollectionMods(payload, deps)
  );
  registerHandler(MESSAGE_TYPES.GET_COLLECTION_HISTORY, () => getCollectionHistory());
  registerHandler(MESSAGE_TYPES.SET_COLLECTION_HISTORY, (payload) => setCollectionHistory(payload));
  registerHandler(MESSAGE_TYPES.START_DOWNLOAD, (payload) => startDownload(payload, deps));
  registerHandler(MESSAGE_TYPES.RESOLVE_COLLECTION_DOWNLOAD, (payload) =>
    resolveCollectionDownload(payload, deps)
  );
  registerHandler(MESSAGE_TYPES.RESOLVE_ARCHIVED_DOWNLOAD, (payload) =>
    resolveArchivedDownload(payload, deps)
  );
  registerHandler(MESSAGE_TYPES.RESOLVE_MOD_DOWNLOAD, (payload) =>
    resolveModDownload(payload, deps)
  );
  registerHandler(MESSAGE_TYPES.COLLECTION_FINISHED, () => collectionFinished());
  registerHandler(MESSAGE_TYPES.VERIFY_COLLECTION_DOWNLOADS, (payload) =>
    verifyCollectionDownloads(payload)
  );
}
