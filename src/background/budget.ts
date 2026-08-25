// src/background/budget.ts — global rolling counter of launched downloads.
// Atomic spend() via a single promise-chain mutex (MV3 workers are single-
// threaded but interleave awaits, so the mutex is the load-bearing piece).

import {
  loadBudget,
  saveBudget,
  type StorageLike,
} from "../core/storage.js";
import type { BudgetState } from "../core/types.js";
import type { Settings } from "../core/settings.js";

export interface BudgetDerived {
  allowed: boolean;
  waitMs: number;
  used: number;
  window: number;
}

export function deriveBudget(
  state: BudgetState,
  nowMs: number,
  windowLaunches: number,
  cooldownMs: number,
): BudgetDerived {
  const cutoff = nowMs - cooldownMs;
  const inWindow = state.launches.filter((t) => t >= cutoff).length;
  const cooldownUntil = state.cooldownUntil ?? 0;
  if (cooldownUntil > nowMs) {
    return {
      allowed: false,
      waitMs: cooldownUntil - nowMs,
      used: inWindow,
      window: windowLaunches,
    };
  }
  return {
    allowed: inWindow < windowLaunches,
    waitMs: 0,
    used: inWindow,
    window: windowLaunches,
  };
}

/**
 * Mutex-guarded read+mutate+write. Returns the post-spend state, the derived
 * view, and whether the spend was accepted.
 */
export class BudgetManager {
  private chain: Promise<unknown> = Promise.resolve();
  private lastKnown: BudgetState | null = null;

  constructor(
    private storage: StorageLike,
    private settings: () => Settings,
  ) {}

  async get(): Promise<{ state: BudgetState; derived: BudgetDerived }> {
    return this.runExclusive(async () => {
      const state = (await loadBudget(this.storage)) as BudgetState;
      this.lastKnown = state;
      const s = this.settings();
      return { state, derived: deriveBudget(state, Date.now(), s.budgetWindowLaunches, s.budgetCooldownMs) };
    });
  }

  /**
   * Record a launch. Returns { ok: true } when accepted, { ok: false, waitMs }
   * when the window is full (and a cooldown was installed).
   */
  async spend(key: string): Promise<{ ok: true } | { ok: false; waitMs: number }> {
    return this.runExclusive(async () => {
      const s = this.settings();
      const state = (await loadBudget(this.storage)) as BudgetState;
      const nowMs = Date.now();
      const cutoff = nowMs - s.budgetCooldownMs;
      const fresh = state.launches.filter((t) => t >= cutoff);
      const derived = deriveBudget(
        { launches: fresh, cooldownUntil: state.cooldownUntil },
        nowMs,
        s.budgetWindowLaunches,
        s.budgetCooldownMs,
      );
      if (!derived.allowed) {
        // Install a cooldown so other tabs see the same waitMs.
        const until = nowMs + s.budgetCooldownMs;
        const next: BudgetState = { launches: fresh, cooldownUntil: until };
        await saveBudget(this.storage, next);
        this.lastKnown = next;
        return { ok: false, waitMs: s.budgetCooldownMs };
      }
      const next: BudgetState = {
        launches: [...fresh, nowMs],
        cooldownUntil: null,
      };
      await saveBudget(this.storage, next);
      this.lastKnown = next;
      // key is the dedupe key for which the spend happened; accepted for
      // log-side correlation only.
      void key;
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
