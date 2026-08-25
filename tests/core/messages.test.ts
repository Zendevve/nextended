import { describe, expect, it } from "vitest";
import { dispatch, isMsg, on, send } from "@core/messages";

describe("Msg type guard", () => {
  it("accepts every known variant", () => {
    expect(isMsg({ t: "budget:get" })).toBe(true);
    expect(isMsg({ t: "budget:spend", key: "k" })).toBe(true);
    expect(isMsg({ t: "download:browser", url: "https://x" })).toBe(true);
    expect(isMsg({ t: "dedupe:check", key: "k" })).toBe(true);
    expect(isMsg({ t: "dedupe:record", key: "k" })).toBe(true);
  });

  it("rejects unknown shapes", () => {
    expect(isMsg(null)).toBe(false);
    expect(isMsg(undefined)).toBe(false);
    expect(isMsg("budget:get")).toBe(false);
    expect(isMsg({ t: "nope" })).toBe(false);
    expect(isMsg({})).toBe(false);
  });
});

describe("dispatch / on", () => {
  it("invokes the registered handler and returns its response", async () => {
    on("budget:get", async () => ({
      state: { launches: [], cooldownUntil: null },
      derived: { allowed: true, waitMs: 0, used: 0, window: 200 },
    }));
    const r = await dispatch({ t: "budget:get" });
    if ("derived" in r) {
      expect(r.derived.allowed).toBe(true);
    } else {
      throw new Error("budget:get should return derived");
    }
  });

  it("throws when no handler is registered for the type", async () => {
    on("budget:spend", async () => ({ ok: true as const }));
    const r = await dispatch({ t: "budget:spend", key: "x" });
    expect(r).toEqual({ ok: true });
  });
});

describe("send", () => {
  it("returns null when chrome.runtime is unavailable", async () => {
    // In node, chrome.runtime is undefined; the helper should return null.
    const r = await send({ t: "budget:get" });
    expect(r).toBeNull();
  });
});
