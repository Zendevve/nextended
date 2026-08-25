import type { DedupeEntry, QueueItem } from "./types.js";

/** Minimal QueueItem shape that storage layer cares about; mirrors QueueItem
 *  but stays importable without pulling the full types module. */
export type QueueItemLike = QueueItem;
/**
 * Dedupe registry key per PRD §2.3 / FR7.
 * Format: `${gameDomain}:${modId}:${fileId}`.
 */
export function dedupeKey(
  gameDomain: string,
  modId: string,
  fileId: string,
): string {
  return `${gameDomain}:${modId}:${fileId}`;
}

/** Validate a candidate dedupe key has the expected 3 colon-separated parts. */
export function isValidDedupeKey(key: string): boolean {
  const parts = key.split(":");
  return parts.length === 3 && parts.every((p) => p.length > 0);
}

/** Parse a dedupe key into its components. Throws on malformed input. */
export function parseDedupeKey(key: string): {
  gameDomain: string;
  modId: string;
  fileId: string;
} {
  const parts = key.split(":");
  if (parts.length !== 3) {
    throw new Error(`[Nextended] invalid dedupe key: ${key}`);
  }
  const [gameDomain, modId, fileId] = parts as [string, string, string];



  return { gameDomain, modId, fileId };
}

/**
 * Drop entries older than `nowMs - ttlMs`. When ttlMs is 0 the dedupe is disabled
 * and the registry is returned empty.
 */
export function pruneDedupe(
  entries: readonly DedupeEntry[],
  nowMs: number,
  ttlMs: number,
): DedupeEntry[] {
  if (ttlMs <= 0) return [];
  const cutoff = nowMs - ttlMs;
  return entries.filter((e) => e.launchedAt >= cutoff);
}

/** Check whether the given key has a non-expired entry in the registry. */
export function dedupeHas(
  entries: readonly DedupeEntry[],
  key: string,
  nowMs: number,
  ttlMs: number,
): boolean {
  if (ttlMs <= 0) return false;
  const cutoff = nowMs - ttlMs;
  for (const e of entries) {
    if (e.key === key && e.launchedAt >= cutoff) return true;
  }
  return false;
}

/**
 * Like `dedupeHas` but returns the matching entry. Saves a second O(n) scan
 * in callers that need the entry's `launchedAt`.
 */
export function dedupeFind(
  entries: readonly DedupeEntry[],
  key: string,
  nowMs: number,
  ttlMs: number,
): DedupeEntry | null {
  if (ttlMs <= 0) return null;
  const cutoff = nowMs - ttlMs;
  for (const e of entries) {
    if (e.key === key && e.launchedAt >= cutoff) return e;
  }
  return null;
}

// ----- Storage keys (PRD §2.3) -----

export const STORAGE_PREFIX = "nextended.v1";
export const QUARANTINE_PREFIX = "nextended.corrupt";
export const ITEMS_PREFIX = `${STORAGE_PREFIX}.items`;
export const ITEM_CHUNK_SIZE = 100;

export const K = {
  settings: `${STORAGE_PREFIX}.settings`,
  budget: `${STORAGE_PREFIX}.budget`,
  dedupe: `${STORAGE_PREFIX}.dedupe`,
  history: `${STORAGE_PREFIX}.history`,
  activeRun: `${STORAGE_PREFIX}.activeRun`,
} as const;

export function runKey(runId: string): string {
  return `${STORAGE_PREFIX}.run.${runId}`;
}

export function itemsKeyFor(runId: string, chunkIndex: number): string {
  return `${ITEMS_PREFIX}.${runId}.${chunkIndex}`;
}

export function itemsPrefixFor(runId: string): string {
  return `${ITEMS_PREFIX}.${runId}.`;
}

/**
 * Chunk an array of QueueItem into storage keys. Each key holds at most
 * ITEM_CHUNK_SIZE items; multiple keys share the same runId namespace.
 */
export function chunkItems<T>(
  runId: string,
  items: readonly T[],
): { key: string; items: T[] }[] {
  if (items.length === 0) return [];
  const chunks: { key: string; items: T[] }[] = [];
  for (let i = 0; i < items.length; i += ITEM_CHUNK_SIZE) {
    chunks.push({
      key: itemsKeyFor(runId, i),
      items: items.slice(i, i + ITEM_CHUNK_SIZE),
    });
  }
  return chunks;
}

/** Quarantine key for a corrupt storage value, timestamped. */
export function quarantineKey(timestamp: number): string {
  return `${QUARANTINE_PREFIX}.${timestamp}`;
}

/** Parse an items key back into its (runId, chunkIndex) pair, or null. */
export function parseItemsKey(
  key: string,
): { runId: string; chunkIndex: number } | null {
  const prefix = `${ITEMS_PREFIX}.`;
  if (!key.startsWith(prefix)) return null;
  const rest = key.slice(prefix.length);
  const lastDot = rest.lastIndexOf(".");
  if (lastDot < 1) return null;
  const runId = rest.slice(0, lastDot);
  const chunkIndex = Number.parseInt(rest.slice(lastDot + 1), 10);
  if (!Number.isFinite(chunkIndex)) return null;
  return { runId, chunkIndex };
}
