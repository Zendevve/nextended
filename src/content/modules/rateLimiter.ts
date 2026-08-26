import { StorageManager } from '../../common/storage';

export class RateLimiter {
  private static ROLLING_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
  private static MAX_DOWNLOADS_BEFORE_COOLDOWN = 200;
  private static COOLDOWN_WAIT_SEC = 5 * 60; // 5 minutes

  static calculateFilePause(fileSizeKb: number, speedMb: number, extraPauseSec: number): number {
    if (extraPauseSec === 0) return 0;
    const computedPause = Math.round(fileSizeKb / 1024 / (speedMb || 1.5));
    return computedPause + extraPauseSec;
  }

  static async registerDownload(): Promise<{ requiresCooldown: boolean; waitTimeSec: number }> {
    const now = Date.now();
    const state = await StorageManager.getRateLimitState();

    if (now - state.lastResetTimestamp > this.ROLLING_WINDOW_MS) {
      state.count = 1;
      state.lastResetTimestamp = now;
      await StorageManager.setRateLimitState(state);
      return { requiresCooldown: false, waitTimeSec: 0 };
    }

    state.count++;
    await StorageManager.setRateLimitState(state);

    if (state.count >= this.MAX_DOWNLOADS_BEFORE_COOLDOWN) {
      state.count = 0;
      state.lastResetTimestamp = Date.now();
      await StorageManager.setRateLimitState(state);
      return { requiresCooldown: true, waitTimeSec: this.COOLDOWN_WAIT_SEC };
    }

    return { requiresCooldown: false, waitTimeSec: 0 };
  }
}
