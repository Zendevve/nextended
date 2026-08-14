import { createLogger } from '../shared/logger.js';

const log = createLogger('concurrency');

export class ConcurrencyController {
  constructor(options = {}) {
    this.maxConcurrent = Math.max(1, Math.min(5, options.maxConcurrent || 2));
    this.retryAttempts = Math.max(0, options.retryAttempts ?? 3);
    this.backoffBaseMs = Math.max(500, options.backoffBaseMs || 2000);
    this.maxBackoffMs = options.maxBackoffMs || 30000;
    this.activeWorkers = 0;
    this.rateLimitedUntil = 0;
    this.isPaused = false;
  }

  updateOptions(options = {}) {
    if (options.maxConcurrent != null) {
      this.maxConcurrent = Math.max(1, Math.min(5, options.maxConcurrent));
    }
    if (options.retryAttempts != null) {
      this.retryAttempts = Math.max(0, options.retryAttempts);
    }
    if (options.backoffBaseMs != null) {
      this.backoffBaseMs = Math.max(500, options.backoffBaseMs);
    }
  }

  pause() {
    this.isPaused = true;
  }

  resume() {
    this.isPaused = false;
  }

  canAcceptWork() {
    if (this.isPaused) return false;
    if (Date.now() < this.rateLimitedUntil) return false;
    return this.activeWorkers < this.maxConcurrent;
  }

  getAvailableSlots() {
    if (this.isPaused || Date.now() < this.rateLimitedUntil) return 0;
    return Math.max(0, this.maxConcurrent - this.activeWorkers);
  }

  handleRateLimit(retryAfterSeconds = null) {
    const delayMs = retryAfterSeconds
      ? retryAfterSeconds * 1000
      : this.backoffBaseMs * 2;
    this.rateLimitedUntil = Date.now() + Math.min(delayMs, this.maxBackoffMs);
    log.warn(`Rate limit triggered — throttling queue for ${Math.round(delayMs / 1000)}s`);
  }

  calculateBackoff(attempt) {
    const exponential = this.backoffBaseMs * Math.pow(2, attempt);
    const jitter = Math.random() * 500;
    return Math.min(this.maxBackoffMs, exponential + jitter);
  }

  async executeWithRetry(taskFn, onItemStatusUpdate = null) {
    let attempt = 0;
    this.activeWorkers += 1;

    try {
      while (true) {
        if (this.isPaused) {
          throw new Error('Queue paused');
        }

        const waitTime = this.rateLimitedUntil - Date.now();
        if (waitTime > 0) {
          await new Promise((r) => setTimeout(r, waitTime));
        }

        try {
          const result = await taskFn();
          return { success: true, result };
        } catch (err) {
          attempt += 1;
          const isRateLimit =
            err?.code === 'CLOUDFLARE' ||
            err?.status === 429 ||
            /rate limit|too many requests/i.test(err?.message || '');

          if (isRateLimit) {
            this.handleRateLimit();
          }

          if (attempt > this.retryAttempts || this.isPaused) {
            log.error(`Task failed after ${attempt} attempts`, { error: err?.message });
            return { success: false, error: err?.message || 'Task failed', code: err?.code };
          }

          const backoffMs = this.calculateBackoff(attempt);
          log.warn(`Task attempt ${attempt} failed, retrying in ${Math.round(backoffMs)}ms`, {
            error: err?.message,
          });

          if (typeof onItemStatusUpdate === 'function') {
            onItemStatusUpdate({
              retryAttempt: attempt,
              retryInMs: backoffMs,
              lastError: err?.message,
            });
          }

          await new Promise((r) => setTimeout(r, backoffMs));
        }
      }
    } finally {
      this.activeWorkers = Math.max(0, this.activeWorkers - 1);
    }
  }
}
