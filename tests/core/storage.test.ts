import { describe, expect, it } from "vitest";
import {
  loadSettings,
  saveSettings,
  loadBudget,
  saveBudget,
  loadDedupe,
  saveDedupe,
  loadHistory,
  saveHistory,
  loadActiveRunId,
  saveActiveRunId,
  saveItems,
  loadItems,
  clearItems,
  memoryStorageLike,
} from "@core/storage";
import { DEFAULT_SETTINGS } from "@core/settings";
import { dedupeKey } from "@core/keys";
import type { QueueItem } from "@core/types";

function makeItem(i: number): QueueItem {
  return {
    key: dedupeKey("skyrim", "1", String(i)),
    fileId: String(i),
    modId: "1",
    gameDomain: "skyrim",
    gameNumericId: 110,
    modName: `Mod ${i}`,
    fileName: `file-${i}.zip`,
    fileUri: `/files/file-${i}.zip`,
    sizeKB: 1024,
    optional: false,
    modPageUrl: "https://www.nexusmods.com/skyrim/mods/1?tab=files&file_id=" + i,
    status: "pending",
    updatedAt: 1000 + i,
  };
}

describe("settings round-trip", () => {
  it("returns defaults when storage is empty", async () => {
    const s = memoryStorageLike();
    expect(await loadSettings(s)).toEqual(DEFAULT_SETTINGS);
  });

  it("writes then reads back the settings", async () => {
    const s = memoryStorageLike();
    const next = { ...DEFAULT_SETTINGS, debugMode: true };
    await saveSettings(s, next);
    expect(await loadSettings(s)).toEqual(next);
  });

  it("quarantines a corrupt settings blob and falls back to defaults", async () => {
    const s = memoryStorageLike();
    await s.set("nextended.v1.settings", { downloadMode: "wat" });
    expect(await loadSettings(s)).toEqual(DEFAULT_SETTINGS);
  });
});

describe("budget / dedupe / history round-trip", () => {
  it("round-trips budget", async () => {
    const s = memoryStorageLike();
    await saveBudget(s, { launches: [1, 2, 3], cooldownUntil: 99 });
    expect(await loadBudget(s)).toEqual({ launches: [1, 2, 3], cooldownUntil: 99 });
  });
  it("returns empty budget on miss", async () => {
    const s = memoryStorageLike();
    expect(await loadBudget(s)).toEqual({ launches: [], cooldownUntil: null });
  });
  it("round-trips dedupe", async () => {
    const s = memoryStorageLike();
    await saveDedupe(s, [{ key: "k", launchedAt: 1 }]);
    expect(await loadDedupe(s)).toEqual([{ key: "k", launchedAt: 1 }]);
  });
  it("round-trips history", async () => {
    const s = memoryStorageLike();
    await saveHistory(s, { skyrim: { foo: { all: ["1", "2"] } } });
    expect(await loadHistory(s)).toEqual({ skyrim: { foo: { all: ["1", "2"] } } });
  });
  it("round-trips activeRunId including null clear", async () => {
    const s = memoryStorageLike();
    expect(await loadActiveRunId(s)).toBeNull();
    await saveActiveRunId(s, "abc");
    expect(await loadActiveRunId(s)).toBe("abc");
    await saveActiveRunId(s, null);
    expect(await loadActiveRunId(s)).toBeNull();
  });
});

describe("item chunking round-trip", () => {
  it("persists >100 items across multiple chunk keys", async () => {
    const s = memoryStorageLike();
    const items: QueueItem[] = Array.from({ length: 137 }, (_, i) => makeItem(i));
    await saveItems(s, "run-A", items);
    const loaded = await loadItems(s, "run-A");
    expect(loaded).toHaveLength(137);
    expect(loaded[0]?.key).toBe(items[0]?.key);
    expect(loaded[136]?.key).toBe(items[136]?.key);
  });

  it("clearItems removes every chunk for a runId", async () => {
    const s = memoryStorageLike();
    await saveItems(s, "run-B", Array.from({ length: 50 }, (_, i) => makeItem(i)));
    await clearItems(s, "run-B");
    expect(await loadItems(s, "run-B")).toEqual([]);
  });

  it("saveItems overwrites prior chunks", async () => {
    const s = memoryStorageLike();
    await saveItems(s, "run-C", Array.from({ length: 250 }, (_, i) => makeItem(i)));
    await saveItems(s, "run-C", [makeItem(999)]);
    const loaded = await loadItems(s, "run-C");
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.key).toBe(makeItem(999).key);
  });

  it("quarantines a corrupt chunk but loads the rest", async () => {
    const s = memoryStorageLike();
    await saveItems(s, "run-D", Array.from({ length: 150 }, (_, i) => makeItem(i)));
    // Replace chunk 0 with garbage
    const chunkKey = "nextended.v1.items.run-D.0";
    await s.set(chunkKey, { not: "valid" });
    const loaded = await loadItems(s, "run-D");
    // 100 items from chunk 100..199 still load; chunk 0 is quarantined.
    expect(loaded.length).toBe(50);
  });
});
