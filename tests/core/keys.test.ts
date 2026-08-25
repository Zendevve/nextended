import { describe, expect, it } from "vitest";
import {
  dedupeKey,
  dedupeHas,
  isValidDedupeKey,
  parseDedupeKey,
  parseItemsKey,
  pruneDedupe,
  K,
  STORAGE_PREFIX,
  ITEMS_PREFIX,
  ITEM_CHUNK_SIZE,
  chunkItems,
  itemsKeyFor,
  itemsPrefixFor,
} from "@core/keys";
import type { DedupeEntry } from "@core/types";

describe("dedupeKey", () => {
  it("joins the three fields with colons", () => {
    expect(dedupeKey("skyrim", "12345", "67890")).toBe("skyrim:12345:67890");
  });

  it("round-trips through parseDedupeKey", () => {
    const k = dedupeKey("baldursgate3", "1", "2");
    const parsed = parseDedupeKey(k);
    expect(parsed).toEqual({ gameDomain: "baldursgate3", modId: "1", fileId: "2" });
  });

  it("rejects malformed keys", () => {
    expect(isValidDedupeKey("a:b")).toBe(false);
    expect(isValidDedupeKey("a::b")).toBe(false);
    expect(isValidDedupeKey(":1:2")).toBe(false);
    expect(isValidDedupeKey("a:b:c")).toBe(true);
  });

  it("parseDedupeKey throws on bad input", () => {
    expect(() => parseDedupeKey("nope")).toThrow();
  });
});

describe("pruneDedupe / dedupeHas", () => {
  const entries: DedupeEntry[] = [
    { key: "k1", launchedAt: 1000 },
    { key: "k2", launchedAt: 5000 },
    { key: "k3", launchedAt: 9000 },
  ];

  it("drops entries older than cutoff", () => {
    // now=10000, ttl=4000 → cutoff=6000; k2 launchedAt=5000 < 6000 → dropped
    expect(pruneDedupe(entries, 10000, 4000)).toEqual([
      { key: "k3", launchedAt: 9000 },
    ]);
  });

  it("returns empty when ttl=0 (dedupe disabled)", () => {
    expect(pruneDedupe(entries, 10000, 0)).toEqual([]);
    expect(dedupeHas(entries, "k1", 10000, 0)).toBe(false);
  });

  it("detects a live entry inside TTL", () => {
    expect(dedupeHas(entries, "k3", 10000, 4000)).toBe(true);
    expect(dedupeHas(entries, "k1", 10000, 4000)).toBe(false);
    expect(dedupeHas(entries, "missing", 10000, 4000)).toBe(false);
  });
});

describe("storage key builders", () => {
  it("uses the nextended.v1 prefix", () => {
    expect(K.settings).toBe("nextended.v1.settings");
    expect(K.budget).toBe("nextended.v1.budget");
    expect(K.dedupe).toBe("nextended.v1.dedupe");
    expect(K.history).toBe("nextended.v1.history");
    expect(K.activeRun).toBe("nextended.v1.activeRun");
    expect(STORAGE_PREFIX).toBe("nextended.v1");
  });

  it("itemsKeyFor + itemsPrefixFor produce well-formed keys", () => {
    expect(itemsKeyFor("run1", 0)).toBe("nextended.v1.items.run1.0");
    expect(itemsPrefixFor("run1")).toBe("nextended.v1.items.run1.");
    expect(ITEMS_PREFIX).toBe("nextended.v1.items");
  });

  it("parseItemsKey round-trips", () => {
    const k = itemsKeyFor("abc-def", 12);
    expect(parseItemsKey(k)).toEqual({ runId: "abc-def", chunkIndex: 12 });
  });

  it("parseItemsKey returns null on bad input", () => {
    expect(parseItemsKey("garbage")).toBeNull();
    expect(parseItemsKey("nextended.v1.items.run1.nan")).toBeNull();
  });
});

describe("chunkItems", () => {
  it("returns an empty array for empty input", () => {
    expect(chunkItems("r", [])).toEqual([]);
  });

  it("packs up to ITEM_CHUNK_SIZE per key", () => {
    const total = ITEM_CHUNK_SIZE * 2 + 7;
    const items = Array.from({ length: total }, (_, i) => i);
    const chunks = chunkItems("r", items);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]?.items).toHaveLength(ITEM_CHUNK_SIZE);
    expect(chunks[1]?.items).toHaveLength(ITEM_CHUNK_SIZE);
    expect(chunks[2]?.items).toHaveLength(7);
    expect(chunks[0]?.key).toBe(itemsKeyFor("r", 0));
    expect(chunks[1]?.key).toBe(itemsKeyFor("r", ITEM_CHUNK_SIZE));
    expect(chunks[2]?.key).toBe(itemsKeyFor("r", ITEM_CHUNK_SIZE * 2));
  });
});
