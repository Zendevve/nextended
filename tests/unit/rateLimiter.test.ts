import { describe, it, expect, beforeEach } from 'vitest';
import { RateLimiter, SAFE_FLOOR } from '../../src/content/modules/rateLimiter';
import { StorageManager } from '../../src/common/storage';

describe('RateLimiter', () => {
  beforeEach(async () => {
    await StorageManager.setRateLimitState({ count: 0, lastResetTimestamp: Date.now() });
  });

  it('exposes the Safe Floor as exported data with a positive free-account value', () => {
    expect(Number.isInteger(SAFE_FLOOR.freeAccountExtraPauseSec)).toBe(true);
    expect(SAFE_FLOOR.freeAccountExtraPauseSec).toBeGreaterThan(0);
  });

  it('calculates file pauses accurately based on size and speed at the floor', () => {
    // 10240 KB = 10 MB. At 2 MB/s = 5s + 5s extra = 10s
    const pause = RateLimiter.calculateFilePause(10240, 2.0, 5);
    expect(pause).toBe(10);
  });

  it('raises a configured pause below the Safe Floor to the floor', () => {
    // Computed transfer time (5s) still applies; the extra pause is clamped up.
    const floorDerived = 5 + SAFE_FLOOR.freeAccountExtraPauseSec;
    expect(RateLimiter.calculateFilePause(10240, 2.0, 0)).toBe(floorDerived);
    expect(RateLimiter.calculateFilePause(10240, 2.0, 2)).toBe(floorDerived);
  });

  it('passes a configured pause above the Safe Floor through unchanged', () => {
    const pause = RateLimiter.calculateFilePause(10240, 2.0, 30);
    expect(pause).toBe(35);
  });

  it('tracks downloads and returns cooldown when hitting 200 downloads cap', async () => {
    await StorageManager.setRateLimitState({ count: 199, lastResetTimestamp: Date.now() });

    const result = await RateLimiter.registerDownload();
    expect(result.requiresCooldown).toBe(true);
    expect(result.waitTimeSec).toBe(300);
  });
});
