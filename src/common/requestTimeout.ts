import { StorageManager } from './storage';
import { DEFAULT_CONFIG } from './config';

export interface TimeoutGuard {
  /** Pass to fetch() so the request aborts when the timeout elapses. */
  signal: AbortSignal;
  /** Cancel the pending timeout timer once the response body is consumed. */
  clear(): void;
}

export class RequestTimeout {
  /**
   * Configured request timeout in milliseconds (issue #12). Reads persisted
   * config through StorageManager and falls back to DEFAULT_CONFIG (30000)
   * when the stored value is missing or not a positive number.
   */
  static async configuredMs(): Promise<number> {
    try {
      const config = await StorageManager.getConfig();
      const ms = config?.requestTimeoutMs;
      return typeof ms === 'number' && ms > 0 ? ms : DEFAULT_CONFIG.requestTimeoutMs;
    } catch {
      return DEFAULT_CONFIG.requestTimeoutMs;
    }
  }

  /**
   * Arm an abort signal that fires after `timeoutMs`. Uses a manual
   * AbortController (rather than AbortSignal.timeout) so ambient timers stay
   * in control and the timer can be cleared once a request completes,
   * keeping successful calls free of dangling timeouts.
   */
  static arm(timeoutMs: number): TimeoutGuard {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return {
      signal: controller.signal,
      clear: () => clearTimeout(timer)
    };
  }
}
