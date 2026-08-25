// src/background/worker.ts — service-worker message router.
// Per PRD §2.5: handlers are pure request/response; no push to content.
// Every handler re-reads storage so the worker is restartable.

import { dispatch, on } from "../core/messages.js";
import { chromeStorageLike, loadSettings, type StorageLike } from "../core/storage.js";
import { BudgetManager } from "./budget.js";
import { DedupeManager } from "./dedupe.js";
import { startBrowserDownload } from "./downloads.js";
import { parseSettings, type Settings } from "../core/settings.js";

let storage: StorageLike | null = null;
let cachedSettings: Settings | null = null;
let budget: BudgetManager | null = null;
let dedupe: DedupeManager | null = null;

async function ensureSettings(): Promise<Settings> {
  if (!storage) storage = chromeStorageLike();
  const loaded = (await loadSettings(storage)) as Settings;
  cachedSettings = loaded;
  return loaded;
}

function getBudget(): BudgetManager {
  if (!budget) {
    budget = new BudgetManager(
      storage as StorageLike,
      () => cachedSettings ?? (parseSettings({}) as Settings),
    );
  }
  return budget;
}

function getDedupe(): DedupeManager {
  if (!dedupe) {
    dedupe = new DedupeManager(
      storage as StorageLike,
      () => cachedSettings ?? (parseSettings({}) as Settings),
    );
  }
  return dedupe;
}

on("budget:get", async () => getBudget().get());

on("budget:spend", async (msg) => getBudget().spend(msg.key));

on("download:browser", async (msg) => {
  const r = await startBrowserDownload(msg.url, msg.filename);
  if (r.ok && typeof r.downloadId === "number") {
    return { ok: true as const, downloadId: r.downloadId };
  }
  return { ok: false as const, error: r.error ?? "unknown" };
});

on("dedupe:check", async (msg) => getDedupe().check(msg.key));

on("dedupe:record", async (msg) => getDedupe().record(msg.key));

chrome.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
  void dispatch(raw as never)
    .then((response) => sendResponse(response))
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      sendResponse({ ok: false, error: message });
    });
  return true; // keep the channel open for the async sendResponse.
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local") return;
  if (changes["nextended.v1.settings"]) {
    cachedSettings = null;
    await ensureSettings();
  }
});

chrome.runtime.onInstalled.addListener(() => {
  void ensureSettings();
});
