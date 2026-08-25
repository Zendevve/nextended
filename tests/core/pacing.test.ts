import { describe, expect, it } from "vitest";
import { pacingMs, pacingFor, estimateRunDurationMs } from "@core/pacing";
import { DEFAULT_SETTINGS } from "@core/settings";

describe("pacingMs", () => {
  it("returns the fixed floor when size=0", () => {
    expect(pacingMs(0, 1.5, 5)).toBe(5_000);
  });

  it("combines variable + extraPause", () => {
    // 1024 KB / (1.5 * 1024) sec = 0.6667 sec = 666.67 ms
    const expected = (1024 / (1.5 * 1024)) * 1000 + 5 * 1000;
    expect(pacingMs(1024, 1.5, 5)).toBeCloseTo(expected, 5);
  });

  it("scales linearly with file size", () => {
    const a = pacingMs(1024, 1.5, 5);
    const b = pacingMs(2048, 1.5, 5);
    expect(b - a).toBeCloseTo(a - 5_000, 5);
  });

  it("rejects bad inputs", () => {
    expect(() => pacingMs(NaN, 1.5, 5)).toThrow();
    expect(() => pacingMs(100, 0, 5)).toThrow();
    expect(() => pacingMs(100, 1.5, -1)).toThrow();
  });
});

describe("pacingFor / estimateRunDurationMs", () => {
  it("matches pacingMs via Settings defaults", () => {
    expect(pacingFor(0, DEFAULT_SETTINGS)).toBe(DEFAULT_SETTINGS.extraPauseSeconds * 1000);
  });

  it("sums pacing across items", () => {
    const sizes = [1024, 2048, 4096];
    const expected = sizes.reduce(
      (acc, s) => acc + pacingFor(s, DEFAULT_SETTINGS),
      0,
    );
    expect(estimateRunDurationMs(sizes, DEFAULT_SETTINGS)).toBeCloseTo(expected, 5);
  });
});
