// src/core/settings.ts — Settings Zod schema verbatim from PRD §2.4.
// Validate-or-migrate-or-reset at the storage boundary (PRD D6).

import { z } from "zod";

export const SettingsSchema = z.object({
  // General
  downloadMode: z.enum(["vortex", "browser"]).default("vortex"),
  debugMode: z.boolean().default(false),
  // Collections
  assumedSpeedMBps: z.number().min(0.1).default(1.5),
  extraPauseSeconds: z.number().int().min(0).default(5),
  skipDownloadedPrompt: z.boolean().default(true),
  // Single downloads
  autoStartOnFileId: z.boolean().default(true),
  autoCloseTab: z.boolean().default(false), // D11
  closeTabDelayMs: z.number().int().min(500).default(2000),
  skipRequirements: z.boolean().default(false), // D10
  buttonColorFeedback: z.boolean().default(false),
  // Archived
  archivedButtons: z.boolean().default(true),
  // Advanced
  budgetWindowLaunches: z.number().int().min(1).default(200),
  budgetCooldownMs: z.number().int().min(0).default(5 * 60_000),
  dedupeTtlHours: z.number().int().min(0).default(24), // 0 disables
  requestTimeoutMs: z.number().int().min(1000).default(30_000),
});

export type Settings = z.infer<typeof SettingsSchema>;

/**
 * The opinionated defaults per the decision log. Use this when reading settings fails
 * validation; do NOT silently coerce user values.
 */
export const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({});
export function parseSettings(input: unknown): Settings | null {
  if (input === null || input === undefined) return DEFAULT_SETTINGS;
  const result = SettingsSchema.safeParse(input);
  return result.success ? result.data : null;
}

/**
 * Apply a partial update onto current settings, validating the result.
 * Returns null if the merged result is invalid.
 */
export function applySettingsPatch(
  current: Settings,
  patch: Partial<Settings>,
): Settings | null {
  return parseSettings({ ...current, ...patch });
}
