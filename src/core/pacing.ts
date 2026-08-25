// src/core/pacing.ts — pure pacing math, ported from NDC behaviour.
// Per-item pacing = fileSizeKB / (assumedSpeedMBps × 1024) + extraPauseSeconds.

import type { Settings } from "./settings.js";

/**
 * Compute the inter-launch pacing for a single file, in milliseconds.
 *
 *   pacingMs = (sizeKB / (assumedSpeedMBps * 1024)) * 1000 + extraPauseSeconds * 1000
 *
 * - `assumedSpeedMBps` is in megabytes per second (decimal MB/s, not MiB/s).
 * - `extraPauseSeconds` is the fixed post-launch courtesy delay.
 * - Result is always >= `extraPauseSeconds * 1000` (the fixed floor).
 * - NaN/Infinity inputs throw — callers should never pass unknown sizes to the
 *   real engine; those items must be classified and skipped instead.
 */
export function pacingMs(
  sizeKB: number,
  assumedSpeedMBps: number,
  extraPauseSeconds: number,
): number {
  if (!Number.isFinite(sizeKB) || sizeKB < 0) {
    throw new RangeError(`[Nextended] pacingMs: bad sizeKB=${sizeKB}`);
  }
  if (!Number.isFinite(assumedSpeedMBps) || assumedSpeedMBps <= 0) {
    throw new RangeError(
      `[Nextended] pacingMs: bad assumedSpeedMBps=${assumedSpeedMBps}`,
    );
  }
  if (!Number.isFinite(extraPauseSeconds) || extraPauseSeconds < 0) {
    throw new RangeError(
      `[Nextended] pacingMs: bad extraPauseSeconds=${extraPauseSeconds}`,
    );
  }
  const variableMs = (sizeKB / (assumedSpeedMBps * 1024)) * 1000;
  return variableMs + extraPauseSeconds * 1000;
}

/**
 * Like `pacingMs` but skips the input validation. Only call with values
 * that have already been validated at the boundary (e.g. the engine, which
 * gates on `pacingMs` first or reads from a validated Settings object).
 */
export function pacingMsTrusted(
  sizeKB: number,
  assumedSpeedMBps: number,
  extraPauseSeconds: number,
): number {
  const variableMs = (sizeKB / (assumedSpeedMBps * 1024)) * 1000;
  return variableMs + extraPauseSeconds * 1000;
}

/** Convenience: derive pacing from the live Settings object. */
export function pacingFor(sizeKB: number, settings: Settings): number {
  return pacingMs(sizeKB, settings.assumedSpeedMBps, settings.extraPauseSeconds);
}

/**
 * Estimate a run's total wall-clock time, sum of pacing across all items.
 * Useful for the "estimated time remaining" indicator.
 */
export function estimateRunDurationMs(
  sizesKB: readonly number[],
  settings: Settings,
): number {
  // Inline trusted pacing: avoids the per-call validation in pacingMs and the
  // pacingFor wrapper. Settings is already validated at the storage boundary.
  const speed = settings.assumedSpeedMBps;
  const pause = settings.extraPauseSeconds;
  const denom = speed * 1024;
  const pauseMs = pause * 1000;
  let total = 0;
  for (let i = 0; i < sizesKB.length; i++) {
    total += (sizesKB[i]! / denom) * 1000 + pauseMs;
  }
  return total;
}
