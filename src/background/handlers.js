import { MESSAGE_TYPES, STORAGE_KEY_COLLECTION_HISTORY } from '../shared/constants.js';
import { getSettings, incrementStat } from '../storage/settings.js';
import { ERROR_CODES, NexusDownloadError } from '../shared/errors.js';
import { createLogger } from '../shared/logger.js';
import { parseUrlSafe, isSafeDownloadUrl, buildGenerateDownloadUrl } from '../nexus/url-utils.js';
import { registerHandler } from './message-router.js';

const log = createLogger('handlers');

const NXM_SCHEME = 'nxm:';
const NXM_URL_PATTERN = /^nxm:\/\/[^\s/]+(?:\/|$)/i;
const COLLECTION_DOWNLOAD_ENDPOINT =
  'https://www.nexusmods.com/Core/Libs/Common/Managers/Downloads?GenerateDownloadUrl';

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

async function extractValidatedUrl(response) {
  const text = await response.text();
  if (response.status === 404) {
    throw new NexusDownloadError(ERROR_CODES.FILE_NOT_FOUND, 'File not found');
  }
  // Cloudflare sniff catches 403 challenge pages and 200 challenge pages;
  // a plain 404/403 with a cf- string in the body is still that status.
  if (/cloudflare|cf-/i.test(text)) {
    throw new NexusDownloadError(ERROR_CODES.CLOUDFLARE, 'Blocked by Cloudflare');
  }
  if (response.status === 403) {
    throw new NexusDownloadError(ERROR_CODES.AUTH_ERROR, 'Authentication required');
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

  let url =
    json?.url || json?.URL || json?.Url || json?.data?.URI || json?.data?.url || null;
  if (!url && text) {
    const match = text.match(/nxm:\/\/[^\s"'<>]+/i) || text.match(/https?:\/\/[^\s"'<>]+/i);
    if (match) url = match[0];
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
        fileId: parsed?.searchParams.get('file_id') || null,
      });
      resolve({ success: true, downloadId });
    });
  });
}

export async function resolveCollectionDownload(payload, _deps = {}) {
  const { fileId, gameId, gameDomain, isNMM, modId } = payload || {};
  if (!fileId) {
    return { url: null, error: 'Missing fileId', code: ERROR_CODES.INVALID_INPUT };
  }
  const settings = await getSettings();
  const timeout = settings.requestTimeout || 30000;
  const body = `fid=${encodeURIComponent(fileId)}&game_id=${encodeURIComponent(gameId || '0')}${isNMM ? '&nmm=1' : ''}`;
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
    if (isNMM && gameDomain && modId) {
      return { url: `nxm://${gameDomain}/mods/${modId}/files/${fileId}`, fileId };
    }
    if (isNMM) {
      return { url: null, error: 'Missing modId for NMM download', code: ERROR_CODES.INVALID_URL };
    }
    return { url: null, error: 'No download URL returned from Nexus', code: ERROR_CODES.INVALID_RESPONSE };
  } catch (e) {
    return resolveFailure(e);
  }
}

export async function resolveArchivedDownload(payload, _deps = {}) {
  const { fileId, slug, isNMM } = payload || {};
  if (!fileId || !slug) {
    return { url: null, error: 'Missing fileId or slug', code: ERROR_CODES.INVALID_INPUT };
  }
  const settings = await getSettings();
  const timeout = settings.requestTimeout || 30000;
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

export async function collectionFinished() {
  try {
    await incrementStat('collectionsDownloaded', 1);
  } catch {
    /* stats are best-effort */
  }
  return { ok: true };
}

export function registerHandlers(deps = {}) {
  registerHandler(MESSAGE_TYPES.SETTINGS_CHANGED, () => settingsChanged(deps));
  registerHandler(MESSAGE_TYPES.FETCH_COLLECTION_REVISIONS, (payload) =>
    fetchCollectionRevisions(payload, deps)
  );
  registerHandler(MESSAGE_TYPES.FETCH_COLLECTION_MODS, (payload) =>
    fetchCollectionMods(payload, deps)
  );
  registerHandler(MESSAGE_TYPES.GET_COLLECTION_HISTORY, () => getCollectionHistory());
  registerHandler(MESSAGE_TYPES.SET_COLLECTION_HISTORY, (payload) => setCollectionHistory(payload));
  registerHandler(MESSAGE_TYPES.START_DOWNLOAD, (payload) => startDownload(payload));
  registerHandler(MESSAGE_TYPES.RESOLVE_COLLECTION_DOWNLOAD, (payload) =>
    resolveCollectionDownload(payload, deps)
  );
  registerHandler(MESSAGE_TYPES.RESOLVE_ARCHIVED_DOWNLOAD, (payload) =>
    resolveArchivedDownload(payload, deps)
  );
  registerHandler(MESSAGE_TYPES.COLLECTION_FINISHED, () => collectionFinished());
}
