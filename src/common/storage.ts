import {
  ExtensionConfig,
  DownloadHistoryStore,
  DownloadRateLimitState,
  ConflictAckStore,
  ConflictDetectionState
} from './types';
import { DEFAULT_CONFIG } from './config';

function mergeConfig(stored?: Partial<ExtensionConfig> | null): ExtensionConfig {
  return {
    ...DEFAULT_CONFIG,
    ...stored,
    externalDownloader: { ...DEFAULT_CONFIG.externalDownloader, ...(stored?.externalDownloader || {}) }
  };
}

const CONFIG_KEY = 'nextended_config';
const HISTORY_KEY = 'nextended_history';
const RATE_LIMIT_KEY = 'nextended_rate_limit';
const CONFLICT_ACK_KEY = 'nextended_conflict_ack';
const CONFLICT_STATE_KEY = 'nextended_conflict_state';

export class StorageManager {
  static async getConfig(): Promise<ExtensionConfig> {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const res = await chrome.storage.local.get(CONFIG_KEY);
      return mergeConfig(res[CONFIG_KEY]);
    }
    const local = localStorage.getItem(CONFIG_KEY);
    if (local) {
      try {
        return mergeConfig(JSON.parse(local));
      } catch {}
    }
    return mergeConfig();
  }

  static async setConfig(config: Partial<ExtensionConfig>): Promise<ExtensionConfig> {
    const current = await this.getConfig();
    const updated = { ...current, ...config };
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set({ [CONFIG_KEY]: updated });
    } else {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(updated));
    }
    return updated;
  }

  static async getHistory(): Promise<DownloadHistoryStore> {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const res = await chrome.storage.local.get(HISTORY_KEY);
      return res[HISTORY_KEY] || {};
    }
    const local = localStorage.getItem(HISTORY_KEY);
    if (local) {
      try {
        return JSON.parse(local);
      } catch {}
    }
    return {};
  }

  static async setHistory(history: DownloadHistoryStore): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set({ [HISTORY_KEY]: history });
    } else {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    }
  }

  static async getRateLimitState(): Promise<DownloadRateLimitState> {
    const defaultState: DownloadRateLimitState = { count: 0, lastResetTimestamp: Date.now() };
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const res = await chrome.storage.local.get(RATE_LIMIT_KEY);
      return res[RATE_LIMIT_KEY] || defaultState;
    }
    const local = localStorage.getItem(RATE_LIMIT_KEY);
    if (local) {
      try {
        return JSON.parse(local);
      } catch {}
    }
    return defaultState;
  }

  static async setRateLimitState(state: DownloadRateLimitState): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set({ [RATE_LIMIT_KEY]: state });
    } else {
      localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(state));
    }
  }

  static async getConflictAck(): Promise<ConflictAckStore> {
    const defaultState: ConflictAckStore = { ackedAt: 0, scripts: [] };
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const res = await chrome.storage.local.get(CONFLICT_ACK_KEY);
      return res[CONFLICT_ACK_KEY] || defaultState;
    }
    const local = localStorage.getItem(CONFLICT_ACK_KEY);
    if (local) {
      try {
        return JSON.parse(local);
      } catch {}
    }
    return defaultState;
  }

  static async setConflictAck(ack: ConflictAckStore): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set({ [CONFLICT_ACK_KEY]: ack });
    } else {
      localStorage.setItem(CONFLICT_ACK_KEY, JSON.stringify(ack));
    }
  }

  static async getConflictState(): Promise<ConflictDetectionState> {
    const defaultState: ConflictDetectionState = { detected: [], unacknowledged: [], updatedAt: 0 };
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const res = await chrome.storage.local.get(CONFLICT_STATE_KEY);
      return res[CONFLICT_STATE_KEY] || defaultState;
    }
    const local = localStorage.getItem(CONFLICT_STATE_KEY);
    if (local) {
      try {
        return JSON.parse(local);
      } catch {}
    }
    return defaultState;
  }

  static async setConflictState(state: ConflictDetectionState): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set({ [CONFLICT_STATE_KEY]: state });
    } else {
      localStorage.setItem(CONFLICT_STATE_KEY, JSON.stringify(state));
    }
  }
}
