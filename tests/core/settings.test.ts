import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  SettingsSchema,
  applySettingsPatch,
  parseSettings,
} from "@core/settings";

describe("Settings schema", () => {
  it("applies opinionated defaults on empty input", () => {
    const parsed = parseSettings({});
    expect(parsed).toEqual(DEFAULT_SETTINGS);
  });

  it("matches PRD §2.4 default values", () => {
    expect(DEFAULT_SETTINGS.downloadMode).toBe("vortex");
    expect(DEFAULT_SETTINGS.debugMode).toBe(false);
    expect(DEFAULT_SETTINGS.assumedSpeedMBps).toBe(1.5);
    expect(DEFAULT_SETTINGS.extraPauseSeconds).toBe(5);
    expect(DEFAULT_SETTINGS.autoStartOnFileId).toBe(true);
    expect(DEFAULT_SETTINGS.autoCloseTab).toBe(false); // D11
    expect(DEFAULT_SETTINGS.skipRequirements).toBe(false); // D10
    expect(DEFAULT_SETTINGS.archivedButtons).toBe(true);
    expect(DEFAULT_SETTINGS.budgetWindowLaunches).toBe(200);
    expect(DEFAULT_SETTINGS.budgetCooldownMs).toBe(5 * 60_000);
    expect(DEFAULT_SETTINGS.dedupeTtlHours).toBe(24);
    expect(DEFAULT_SETTINGS.requestTimeoutMs).toBe(30_000);
  });

  it("rejects invalid downloadMode", () => {
    expect(parseSettings({ downloadMode: "curl" })).toBeNull();
  });

  it("rejects assumedSpeedMBps < 0.1", () => {
    expect(parseSettings({ assumedSpeedMBps: 0.05 })).toBeNull();
  });

  it("rejects closeTabDelayMs < 500", () => {
    expect(parseSettings({ closeTabDelayMs: 100 })).toBeNull();
  });

  it("applies a partial patch over current settings", () => {
    const patched = applySettingsPatch(DEFAULT_SETTINGS, {
      assumedSpeedMBps: 3.0,
      extraPauseSeconds: 10,
    });
    expect(patched?.assumedSpeedMBps).toBe(3.0);
    expect(patched?.extraPauseSeconds).toBe(10);
    expect(patched?.downloadMode).toBe("vortex");
  });

  it("rejects a patch that violates the schema", () => {
    expect(applySettingsPatch(DEFAULT_SETTINGS, { assumedSpeedMBps: -1 })).toBeNull();
  });
  it("parses null/undefined as defaults", () => {
    expect(parseSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it("schema itself round-trips DEFAULT_SETTINGS", () => {
    const round = SettingsSchema.parse(DEFAULT_SETTINGS);
    expect(round).toEqual(DEFAULT_SETTINGS);
  });
});
