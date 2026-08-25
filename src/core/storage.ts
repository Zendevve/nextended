// src/core/storage.ts — Zod-validated get/set on chrome.storage.local, with
// migration quarantine. Validate-or-migrate-or-reset at the boundary (D6).

import { z } from "zod";
import {
  K,
  chunkItems,
  itemsPrefixFor,
  quarantineKey,
  type QueueItemLike,
} from "./keys.js";
import type { BudgetState, DedupeEntry, HistoryMap } from "./types.js";
import { DEFAULT_SETTINGS, parseSettings, type Settings } from "./settings.js";

// =============================================================================
// Schemas (read-time validation)
// =============================================================================

export const BudgetStateSchema = z.object({
  launches: z.array(z.number()).default([]),
  cooldownUntil: z.number().nullable().default(null),
});

export const DedupeEntrySchema = z.object({
  key: z.string().min(1),
  launchedAt: z.number(),
});

export const HistoryMapSchema = z.record(
  z.string(),
  z.record(z.string(), z.record(z.string(), z.array(z.string()))),
);

export const QueueItemSchema = z.object({
  key: z.string().min(1),
  fileId: z.string(),
  modId: z.string(),
  gameDomain: z.string(),
  gameNumericId: z.number().int(),
  modName: z.string(),
  fileName: z.string(),
  fileUri: z.string(),
  sizeKB: z.number().min(0),
  optional: z.boolean(),
  modPageUrl: z.string(),
  status: z.enum([
    "pending",
    "resolving",
    "launched",
    "done",
    "failed",
    "skipped",
  ]),
  strategy: z
    .enum([
      "nxm-passthrough",
      "component-attr",
      "api-files",
      "page-regex",
      "generate-nmm",
      "generate-plain",
      "deep-scrape",
    ])
    .optional(),
  errorClass: z
    .enum(["login", "cloudflare", "suspended", "unresolved", "network"])
    .optional(),
  updatedAt: z.number(),
});

export const QueueItemArraySchema = z.array(QueueItemSchema);

export const BulkRunSchema = z.object({
  runId: z.string().min(1),
  gameDomain: z.string().min(1),
  collectionSlug: z.string().min(1),
  revision: z.number().int().nullable(),
  runType: z.enum(["all", "mandatory", "optional", "custom"]),
  mode: z.enum(["vortex", "browser"]),
  itemKeys: z.array(z.string()),
  cursor: z.number().int().min(0),
  engine: z.enum(["idle", "running", "paused", "stopped", "finished"]),
  startedAt: z.number(),
  updatedAt: z.number(),
});

// =============================================================================
// Storage surface
// =============================================================================

export interface StorageLike {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
  removePrefix(prefix: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
}

export function chromeStorageLike(): StorageLike {
  const area = chrome.storage.local;
  return {
    async get(key) {
      const out = await new Promise<Record<string, unknown>>((resolve) => {
        area.get(key, (items) => {
          resolve((items ?? {}) as Record<string, unknown>);
        });
      });
      if (!(key in out)) return undefined;
      return out[key];
    },
    async set(key, value) {
      await new Promise<void>((resolve) => {
        area.set({ [key]: value }, () => resolve());
      });
    },
    async remove(key) {
      await new Promise<void>((resolve) => {
        area.remove(key, () => resolve());
      });
    },
    async removePrefix(prefix) {
      const all = await new Promise<Record<string, unknown>>((resolve) => {
        area.get(null, (items) => {
          resolve((items ?? {}) as Record<string, unknown>);
        });
      });
      const matched = Object.keys(all).filter((k) => k.startsWith(prefix));
      if (matched.length > 0) {
        await new Promise<void>((resolve) => {
          area.remove(matched, () => resolve());
        });
      }
    },
    async list(prefix) {
      const all = await new Promise<Record<string, unknown>>((resolve) => {
        area.get(null, (items) => {
          resolve((items ?? {}) as Record<string, unknown>);
        });
      });
      return Object.keys(all).filter((k) => k.startsWith(prefix));
    },
  };
}

export function memoryStorageLike(): StorageLike {
  const map = new Map<string, unknown>();
  return {
    async get(key) {
      return map.get(key);
    },
    async set(key, value) {
      map.set(key, value);
    },
    async remove(key) {
      map.delete(key);
    },
    async removePrefix(prefix) {
      for (const k of [...map.keys()]) {
        if (k.startsWith(prefix)) map.delete(k);
      }
    },
    async list(prefix) {
      return [...map.keys()].filter((k) => k.startsWith(prefix));
    },
  };
}

// =============================================================================
// Typed getters / setters with migration quarantine
// =============================================================================

export async function loadSettings(storage: StorageLike): Promise<Settings> {
  const raw = await storage.get(K.settings);
  if (raw === undefined) return DEFAULT_SETTINGS;
  const result = parseSettings(raw);
  if (result) return result;
  const ts = Date.now();
  await storage.set(quarantineKey(ts), { key: K.settings, raw });
  return DEFAULT_SETTINGS;
}

export async function saveSettings(
  storage: StorageLike,
  settings: Settings,
): Promise<void> {
  await storage.set(K.settings, settings);
}

export async function loadBudget(storage: StorageLike): Promise<BudgetState> {
  const raw = await storage.get(K.budget);
  if (raw === undefined) return { launches: [], cooldownUntil: null };
  const result = BudgetStateSchema.safeParse(raw);
  if (result.success) return result.data as BudgetState;
  const ts = Date.now();
  await storage.set(quarantineKey(ts), { key: K.budget, raw });
  return { launches: [], cooldownUntil: null };
}

export async function saveBudget(
  storage: StorageLike,
  budget: BudgetState,
): Promise<void> {
  await storage.set(K.budget, budget);
}

export async function loadDedupe(storage: StorageLike): Promise<DedupeEntry[]> {
  const raw = await storage.get(K.dedupe);
  if (raw === undefined) return [];
  const result = z.array(DedupeEntrySchema).safeParse(raw);
  if (result.success) return result.data as DedupeEntry[];
  const ts = Date.now();
  await storage.set(quarantineKey(ts), { key: K.dedupe, raw });
  return [];
}

export async function saveDedupe(
  storage: StorageLike,
  entries: DedupeEntry[],
): Promise<void> {
  await storage.set(K.dedupe, entries);
}

export async function loadHistory(storage: StorageLike): Promise<HistoryMap> {
  const raw = await storage.get(K.history);
  if (raw === undefined) return {};
  const result = HistoryMapSchema.safeParse(raw);
  if (result.success) return result.data as HistoryMap;
  const ts = Date.now();
  await storage.set(quarantineKey(ts), { key: K.history, raw });
  return {};
}

export async function saveHistory(
  storage: StorageLike,
  history: HistoryMap,
): Promise<void> {
  await storage.set(K.history, history);
}

export async function loadActiveRunId(
  storage: StorageLike,
): Promise<string | null> {
  const raw = await storage.get(K.activeRun);
  if (typeof raw === "string") return raw;
  if (raw === null) return null;
  return null;
}

export async function saveActiveRunId(
  storage: StorageLike,
  runId: string | null,
): Promise<void> {
  if (runId === null) await storage.remove(K.activeRun);
  else await storage.set(K.activeRun, runId);
}

// =============================================================================
// QueueItem chunked persistence
// =============================================================================

export async function saveItems(
  storage: StorageLike,
  runId: string,
  items: readonly QueueItemLike[],
): Promise<void> {
  const chunks = chunkItems(runId, items);
  await storage.removePrefix(itemsPrefixFor(runId));
  for (const chunk of chunks) {
    await storage.set(chunk.key, chunk.items);
  }
}

export async function loadItems(
  storage: StorageLike,
  runId: string,
): Promise<QueueItemLike[]> {
  const prefix = itemsPrefixFor(runId);
  const keys = (await storage.list(prefix)).filter((k) => k.startsWith(prefix));
  const sorted = keys.sort();
  const all: QueueItemLike[] = [];
  for (const k of sorted) {
    const raw = await storage.get(k);
    if (raw === undefined) continue;
    const result = QueueItemArraySchema.safeParse(raw);
    if (result.success) {
      all.push(...(result.data as unknown as QueueItemLike[]));
    } else {
      const ts = Date.now();
      await storage.set(quarantineKey(ts), { key: k, raw });
    }
  }
  return all;
}

export async function clearItems(
  storage: StorageLike,
  runId: string,
): Promise<void> {
  await storage.removePrefix(itemsPrefixFor(runId));
}
