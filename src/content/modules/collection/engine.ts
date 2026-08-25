// src/content/modules/collection/engine.ts — run engine state machine.
// FR2 + FR6 + FR11. Persists every transition to storage.

import {
  loadActiveRunId,
  loadHistory,
  loadItems,
  saveActiveRunId,
  saveHistory,
  saveItems,
  type StorageLike,
} from "../../../core/storage.js";
import { chromeStorageLike } from "../../../core/storage.js";
import { pacingFor } from "../../../core/pacing.js";
import { resolve, type ResolveResult } from "../../../core/resolver.js";
import { classify, errorClassDisplay, isFatal, type ClassifyInput } from "../../../core/errorClassifier.js";
import { fetchHttpClient } from "../../../core/graphql.js";
import { send } from "../../../core/messages.js";
import { settings } from "../../../content/settings-bridge.js";
import { dedupeKey } from "../../../core/keys.js";
import type {
  BulkRun,
  ErrorClass,
  QueueItem,
  RunType,
  Strategy,
} from "../../../core/types.js";

export interface EngineLogEntry {
  ts: number;
  level: "info" | "warn" | "error";
  message: string;
  data?: unknown;
}

export type EngineListener = (event: EngineEvent) => void;

export type EngineEvent =
  | { kind: "state"; run: BulkRun }
  | { kind: "item"; key: string; status: QueueItem["status"]; strategy?: Strategy; errorClass?: ErrorClass }
  | { kind: "log"; entry: EngineLogEntry }
  | { kind: "fatal"; error: ErrorClass; message: string };

export class CollectionEngine {
  private storage: StorageLike;
  private run: BulkRun | null = null;
  private items: QueueItem[] = [];
  private listeners = new Set<EngineListener>();
  private cursorIndex = 0;
  private paused = false;
  private stopping = false;
  private skipPauseForItem = false;
  private abortController: AbortController | null = null;
  private activeItemKey: string | null = null;

  constructor(storage: StorageLike = chromeStorageLike()) {
    this.storage = storage;
  }

  on(listener: EngineListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  snapshot(): { run: BulkRun | null; items: QueueItem[] } {
    return { run: this.run, items: this.items };
  }

  async resumeIfAny(): Promise<{ run: BulkRun; items: QueueItem[] } | null> {
    const runId = await loadActiveRunId(this.storage);
    if (!runId) return null;
    const items = await loadItems(this.storage, runId);
    const run: BulkRun = {
      runId,
      gameDomain: "",
      collectionSlug: "",
      revision: null,
      runType: "all",
      mode: settings.snapshot().downloadMode,
      itemKeys: items.map((i) => i.key),
      cursor: 0,
      engine: "running",
      startedAt: Date.now(),
      updatedAt: Date.now(),
    };
    // Verify cursor item: if marked "launched" but stuck, mark "done" (launch
    // is fire-and-forget; the run continues regardless).
    for (let i = 0; i < items.length; i++) {
      const it = items[i] as QueueItem;
      if (it.status === "launched") it.status = "done";
    }
    this.run = run;
    this.items = items;
    this.cursorIndex = run.cursor;
    this.emit({ kind: "state", run });
    return { run, items };
  }

  async start(args: {
    runId: string;
    gameDomain: string;
    collectionSlug: string;
    revision: number | null;
    runType: RunType;
    items: QueueItem[];
  }): Promise<void> {
    const mode = settings.snapshot().downloadMode;
    const run: BulkRun = {
      runId: args.runId,
      gameDomain: args.gameDomain,
      collectionSlug: args.collectionSlug,
      revision: args.revision,
      runType: args.runType,
      mode,
      itemKeys: args.items.map((i) => i.key),
      cursor: 0,
      engine: "running",
      startedAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.run = run;
    this.items = args.items.slice();
    this.cursorIndex = 0;
    this.paused = false;
    this.stopping = false;
    await saveItems(this.storage, run.runId, this.items);
    await saveActiveRunId(this.storage, run.runId);
    this.emit({ kind: "state", run });
    this.emitLog("info", "Run started", { runId: run.runId, count: this.items.length });
    void this.runLoop();
  }

  pause(): void {
    if (!this.run) return;
    this.paused = true;
    this.updateRun({ engine: "paused" });
  }

  resume(): void {
    if (!this.run) return;
    this.paused = false;
    this.updateRun({ engine: "running" });
    if (!this.abortController) void this.runLoop();
  }

  stop(): void {
    this.stopping = true;
    this.abortController?.abort();
    if (this.run) this.updateRun({ engine: "stopped" });
  }

  setCursor(index: number): void {
    if (!this.run) return;
    const clamped = Math.max(0, Math.min(index, this.items.length));
    this.cursorIndex = clamped;
    if (this.run) this.run.cursor = clamped;
  }

  skipPauseForNext(): void {
    this.skipPauseForItem = true;
  }

  private updateRun(patch: Partial<BulkRun>): void {
    if (!this.run) return;
    this.run = { ...this.run, ...patch, updatedAt: Date.now() };
    void this.storage.set(`nextended.v1.run.${this.run.runId}`, this.run);
    this.emit({ kind: "state", run: this.run });
  }

  private emitLog(level: EngineLogEntry["level"], message: string, data?: unknown): void {
    const entry: EngineLogEntry = { ts: Date.now(), level, message };
    if (data !== undefined) entry.data = data;
    this.emit({ kind: "log", entry });
  }

  private emit(event: EngineEvent): void {
    for (const l of this.listeners) l(event);
  }

  private async runLoop(): Promise<void> {
    if (this.abortController) return;
    this.abortController = new AbortController();
    try {
      while (this.cursorIndex < this.items.length && this.run) {
        if (this.stopping) break;
        if (this.paused) {
          await sleep(200);
          continue;
        }
        const item = this.items[this.cursorIndex] as QueueItem;
        if (!item) break;
        this.activeItemKey = item.key;
        await this.processItem(item);
        this.cursorIndex += 1;
        if (this.run) this.run.cursor = this.cursorIndex;
        if (this.run) this.updateRun({ cursor: this.cursorIndex });
        // Persist after each item.
        await saveItems(this.storage, this.run?.runId ?? "", this.items);
        if (this.skipPauseForItem) {
          this.skipPauseForItem = false;
        }
        // Pacing.
        const next = this.items[this.cursorIndex];
        if (next) {
          const live = settings.snapshot();
          const wait = pacingFor(next.sizeKB, live);
          this.emitLog("info", "Pacing", { waitMs: wait, nextFile: next.fileName });
          await sleep(wait);
        }
      }
      if (this.run && !this.stopping) {
        this.updateRun({ engine: "finished", cursor: this.items.length });
        this.emitLog("info", "Run finished");
        await this.recordHistory();
        await saveActiveRunId(this.storage, null);
      }
    } finally {
      this.abortController = null;
      this.activeItemKey = null;
    }
  }

  private async processItem(item: QueueItem): Promise<void> {
    const live = settings.snapshot();
    // Check dedupe.
    const key = dedupeKey(item.gameDomain, item.modId, item.fileId);
    const dedupe = await send({ t: "dedupe:check", key });
    if (dedupe && "hit" in dedupe && dedupe.hit) {
      item.status = "skipped";
      this.emit({ kind: "item", key, status: "skipped" });
      this.emitLog("info", "Skipped (dedupe hit)", { mod: item.modName, file: item.fileName });
      return;
    }
    // Budget.
    const budget = await send({ t: "budget:spend", key });
    if (!budget || !("ok" in budget)) {
      item.status = "failed";
      item.errorClass = "network";
      this.emit({ kind: "item", key, status: "failed", errorClass: "network" });
      this.emitLog("error", "Budget request failed", { mod: item.modName });
      return;
    }
    if (!budget.ok) {
      // Park in cooldown until the budget clears.
      this.emitLog("warn", "Budget cooldown", { waitMs: budget.waitMs });
      this.updateRun({ engine: "running" });
      await sleep(Math.min(budget.waitMs, 60_000));
      return;
    }
    // Resolve.
    item.status = "resolving";
    this.emit({ kind: "item", key, status: "resolving" });
    const result: ResolveResult = await resolve(
      {
        gameDomain: item.gameDomain,
        gameNumericId: item.gameNumericId,
        modId: item.modId,
        fileId: item.fileId,
      },
      {
        isNMM: live.downloadMode === "vortex",
        signal: this.abortController?.signal ?? new AbortController().signal,
        client: fetchHttpClient(),
      },
    );
    if (!result.ok) {
      item.status = "failed";
      item.errorClass = result.error;
      this.emit({ kind: "item", key, status: "failed", errorClass: result.error });
      this.emitLog("error", "Resolve failed", { mod: item.modName, error: result.error, evidence: result.evidence });
      if (isFatal(result.error)) {
        this.stopping = true;
        this.updateRun({ engine: "stopped" });
        const display = errorClassDisplay(result.error);
        this.emit({ kind: "fatal", error: result.error, message: display.message });
        return;
      }
      return;
    }
    item.strategy = result.strategy;
    // Launch.
    if (live.downloadMode === "vortex") {
      window.location.assign(result.url);
    } else {
      const r = await send({ t: "download:browser", url: result.url });
      if (!r || !("ok" in r) || !r.ok) {
        item.status = "failed";
        item.errorClass = "network";
        this.emit({ kind: "item", key, status: "failed", errorClass: "network" });
        this.emitLog("error", "Browser download failed", { mod: item.modName });
        return;
      }
    }
    item.status = "launched";
    this.emit({ kind: "item", key, status: "launched", strategy: result.strategy });
    await send({ t: "dedupe:record", key });
    // History will be flushed at the end of the run.
  }

  private async recordHistory(): Promise<void> {
    if (!this.run) return;
    const downloaded = this.items.filter((i) => i.status === "launched" || i.status === "done");
    if (downloaded.length === 0) return;
    const history = (await loadHistory(this.storage)) as Record<
      string,
      Record<string, Record<string, string[]>>
    >;
    const game = (history[this.run.gameDomain] ?? {}) as Record<string, Record<string, string[]>>;
    const slug = (game[this.run.collectionSlug] ?? {}) as Record<string, string[]>;
    const existing = slug[this.run.runType] ?? [];
    const merged = Array.from(new Set([...existing, ...downloaded.map((i) => i.fileId)]));
    slug[this.run.runType] = merged;
    game[this.run.collectionSlug] = slug;
    history[this.run.gameDomain] = game;
    await saveHistory(this.storage, history as never);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export const engine = new CollectionEngine();

// Convenience class for tests: classify final HTTP outcome.
export function finalClassify(input: ClassifyInput): ErrorClass {
  return classify(input);
}
