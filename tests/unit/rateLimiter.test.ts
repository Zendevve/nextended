import { describe, it, expect, beforeEach } from 'vitest';
import { RateLimiter } from '../../src/content/modules/rateLimiter';
import { StorageManager } from '../../src/common/storage';

describe('RateLimiter', () => {
  beforeEach(async () => {
    await StorageManager.setRateLimitState({ count: 0, lastResetTimestamp: Date.now() });
  });

  it('calculates file pauses accurately based on size and speed', () => {
    // 10240 KB = 10 MB. At 2 MB/s = 5s + 5s extra = 10s
    const pause = RateLimiter.calculateFilePause(10240, 2.0, 5);
    expect(pause).toBe(10);
  });

  it('returns 0 pause when extraPauseSec is 0', () => {
    const pause = RateLimiter.calculateFilePause(10240, 2.0, 0);
    expect(pause).toBe(0);
  });

  it('tracks downloads and returns cooldown when hitting 200 downloads cap', async () => {
    await StorageManager.setRateLimitState({ count: 199, lastResetTimestamp: Date.now() });

    const result = await RateLimiter.registerDownload();
    expect(result.requiresCooldown).toBe(true);
    expect(result.waitTimeSec).toBe(300);
  });
});
