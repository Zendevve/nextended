// src/background/dedupe.ts — global dedupe registry shared across tabs.

import {
  loadDedupe,
  saveDedupe,
  type StorageLike,
} from "../core/storage.js";
import { dedupeFind, pruneDedupe } from "../core/keys.js";
import type { DedupeEntry } from "../core/types.js";
import type { Settings } from "../core/settings.js";

export class DedupeManager {
  private chain: Promise<unknown> = Promise.resolve();

  constructor(
    private storage: StorageLike,
    private settings: () => Settings,
  ) {}

  async check(key: string): Promise<{ hit: boolean; launchedAt?: number }> {
    const s = this.settings();
    const ttlMs = s.dedupeTtlHours * 60 * 60 * 1000;
    const entries = (await loadDedupe(this.storage)) as DedupeEntry[];
    const now = Date.now();
    const entry = dedupeFind(entries, key, now, ttlMs);
    if (!entry) return { hit: false };
    return { hit: true, launchedAt: entry.launchedAt };
  }

  async record(key: string): Promise<{ ok: true }> {
    return this.runExclusive(async () => {
      const s = this.settings();
      const ttlMs = s.dedupeTtlHours * 60 * 60 * 1000;
      const existing = (await loadDedupe(this.storage)) as DedupeEntry[];
      const now = Date.now();
      const fresh = pruneDedupe(existing, now, ttlMs).filter((e) => e.key !== key);
      fresh.push({ key, launchedAt: now });
      await saveDedupe(this.storage, fresh);
      return { ok: true };
    });
  }

  private async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const prev = this.chain;
    let resolveNext!: () => void;
    this.chain = new Promise<void>((r) => (resolveNext = r));
    try {
      await prev;
      return await fn();
    } finally {
      resolveNext();
    }
  }
}
