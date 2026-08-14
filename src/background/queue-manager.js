import {
  STORAGE_KEY_QUEUE,
  QUEUE_STATUS,
  ITEM_STATUS,
  DOWNLOAD_METHOD_BROWSER,
} from '../shared/constants.js';
import { getSettings, incrementStat } from '../storage/settings.js';
import { createLogger } from '../shared/logger.js';
import { ConcurrencyController } from './concurrency-controller.js';
import { isSafeDownloadUrl } from '../nexus/url-utils.js';

const log = createLogger('queue-manager');

export class QueueManager {
  constructor(deps = {}) {
    this.deps = deps;
    this.status = QUEUE_STATUS.IDLE;
    this.items = [];
    this.controller = new ConcurrencyController();
    this.isProcessing = false;
    this.lastSpeedCheck = Date.now();
    this.bytesDownloadedSinceCheck = 0;
    this.currentSpeed = 0;
    this.listeners = new Set();
  }

  async init() {
    try {
      const stored = await chrome?.storage?.local?.get(STORAGE_KEY_QUEUE);
      const queueData = stored?.[STORAGE_KEY_QUEUE];
      if (queueData && Array.isArray(queueData.items)) {
        this.items = queueData.items.map((it) => ({
          ...it,
          // Reset any dangling 'resolving' or 'downloading' states from prior browser restarts
          status:
            it.status === ITEM_STATUS.DOWNLOADING || it.status === ITEM_STATUS.RESOLVING
              ? ITEM_STATUS.PENDING
              : it.status,
        }));
        this.status = queueData.status === QUEUE_STATUS.RUNNING ? QUEUE_STATUS.PAUSED : (queueData.status || QUEUE_STATUS.IDLE);
      }
    } catch (e) {
      log.warn('Failed to restore queue state from storage', { error: e?.message });
    }

    const settings = await getSettings();
    this.controller.updateOptions({
      maxConcurrent: settings.maxConcurrentDownloads || 2,
      retryAttempts: settings.retryAttempts ?? 3,
      backoffBaseMs: settings.retryBackoffBaseMs || 2000,
    });
  }

  async persist() {
    const state = this.getState();
    try {
      await chrome?.storage?.local?.set({ [STORAGE_KEY_QUEUE]: state });
      this.notifyListeners(state);
    } catch (e) {
      log.error('Failed to persist queue to storage', { error: e?.message });
    }
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notifyListeners(state) {
    for (const cb of this.listeners) {
      try {
        cb(state);
      } catch {
        /* ignore */
      }
    }
  }

  getState() {
    const total = this.items.length;
    const completed = this.items.filter((i) => i.status === ITEM_STATUS.COMPLETED).length;
    const failed = this.items.filter((i) => i.status === ITEM_STATUS.FAILED).length;
    const active = this.items.filter(
      (i) => i.status === ITEM_STATUS.DOWNLOADING || i.status === ITEM_STATUS.RESOLVING
    ).length;
    const pending = this.items.filter((i) => i.status === ITEM_STATUS.PENDING).length;

    const totalBytes = this.items.reduce((acc, i) => acc + (Number(i.fileSize) || 0), 0);
    const downloadedBytes = this.items
      .filter((i) => i.status === ITEM_STATUS.COMPLETED)
      .reduce((acc, i) => acc + (Number(i.fileSize) || 0), 0);

    return {
      status: this.status,
      items: this.items,
      counts: { total, completed, failed, active, pending },
      totalBytes,
      downloadedBytes,
      currentSpeedBytesPerSec: this.currentSpeed,
      lastUpdated: Date.now(),
    };
  }

  async enqueueItems(rawItems = [], options = {}) {
    const newItems = rawItems.map((item, idx) => ({
      id: `${item.fileId || Date.now()}_${Math.random().toString(36).substring(2, 7)}_${idx}`,
      fileId: String(item.fileId || ''),
      modId: String(item.modId || ''),
      gameDomain: item.gameDomain || item.slug || 'skyrimspecialedition',
      modName: item.modName || item.file?.mod?.name || 'Unknown Mod',
      fileName: item.fileName || item.file?.name || 'mod_file.zip',
      fileVersion: item.fileVersion || item.file?.version || '',
      fileSize: Number(item.fileSize || item.file?.size || 0),
      isNMM: !!item.isNMM,
      isOptional: !!item.isOptional,
      status: item.isExternal ? ITEM_STATUS.EXTERNAL : ITEM_STATUS.PENDING,
      externalUrl: item.externalUrl || null,
      sourceUrl: item.sourceUrl || '',
      error: null,
      retryCount: 0,
      createdAt: Date.now(),
    }));

    this.items.push(...newItems);
    if (this.status === QUEUE_STATUS.IDLE || this.status === QUEUE_STATUS.COMPLETED) {
      this.status = QUEUE_STATUS.RUNNING;
      this.controller.resume();
    }

    await this.persist();
    if (options.autoStart !== false && this.status === QUEUE_STATUS.RUNNING) {
      this.triggerProcessing();
    }
    return { count: newItems.length, total: this.items.length };
  }

  pause() {
    this.status = QUEUE_STATUS.PAUSED;
    this.controller.pause();
    this.persist();
  }

  resume() {
    this.status = QUEUE_STATUS.RUNNING;
    this.controller.resume();
    this.persist();
    this.triggerProcessing();
  }

  clear() {
    this.items = this.items.filter(
      (i) => i.status === ITEM_STATUS.DOWNLOADING || i.status === ITEM_STATUS.RESOLVING
    );
    if (this.items.length === 0) {
      this.status = QUEUE_STATUS.IDLE;
    }
    this.persist();
  }

  skipItem(itemId) {
    const item = this.items.find((i) => i.id === itemId);
    if (item && (item.status === ITEM_STATUS.PENDING || item.status === ITEM_STATUS.FAILED)) {
      item.status = ITEM_STATUS.SKIPPED;
      this.persist();
    }
  }

  retryFailed() {
    let count = 0;
    for (const item of this.items) {
      if (item.status === ITEM_STATUS.FAILED || item.status === ITEM_STATUS.SKIPPED) {
        item.status = ITEM_STATUS.PENDING;
        item.error = null;
        item.retryCount = 0;
        count += 1;
      }
    }
    if (count > 0) {
      this.status = QUEUE_STATUS.RUNNING;
      this.controller.resume();
      this.persist();
      this.triggerProcessing();
    }
    return { retriedCount: count };
  }

  triggerProcessing() {
    if (this.isProcessing) return;
    this.processLoop().catch((err) => {
      log.error('Queue processing loop error', { error: err?.message });
      this.isProcessing = false;
    });
  }

  async processLoop() {
    this.isProcessing = true;
    try {
      while (this.status === QUEUE_STATUS.RUNNING) {
        const availableSlots = this.controller.getAvailableSlots();
        if (availableSlots <= 0) {
          await new Promise((r) => setTimeout(r, 500));
          continue;
        }

        const nextItem = this.items.find((i) => i.status === ITEM_STATUS.PENDING);
        if (!nextItem) {
          const hasActive = this.items.some(
            (i) => i.status === ITEM_STATUS.DOWNLOADING || i.status === ITEM_STATUS.RESOLVING
          );
          if (!hasActive) {
            this.status = this.items.some((i) => i.status === ITEM_STATUS.FAILED)
              ? QUEUE_STATUS.FAILED
              : QUEUE_STATUS.COMPLETED;
            await this.onQueueCompleted();
          }
          break;
        }

        nextItem.status = ITEM_STATUS.RESOLVING;
        await this.persist();

        // Dispatch item execution concurrently
        this.processItem(nextItem).catch((err) => {
          log.error('Item processing error', { itemId: nextItem.id, error: err?.message });
        });

        // Small pacing delay between launching parallel workers
        const settings = await getSettings();
        const pauseSec = Math.max(0.5, Number(settings.collectionPauseBetweenDownload) || 1.5);
        await new Promise((r) => setTimeout(r, (pauseSec * 1000) / 2));
      }
    } finally {
      this.isProcessing = false;
      await this.persist();
    }
  }

  async processItem(item) {
    const execution = await this.controller.executeWithRetry(
      async () => {
        return this.downloadSingleItem(item);
      },
      (update) => {
        item.retryCount = update.retryAttempt;
        item.error = `Retrying in ${Math.round(update.retryInMs / 1000)}s: ${update.lastError}`;
        this.persist();
      }
    );

    if (execution.success) {
      item.status = ITEM_STATUS.COMPLETED;
      item.error = null;
      try {
        await incrementStat('queueItemsDownloaded', 1);
      } catch {
        /* best-effort */
      }
    } else {
      item.status = ITEM_STATUS.FAILED;
      item.error = execution.error || 'Download failed';
    }

    await this.persist();
    this.triggerProcessing();
  }

  async downloadSingleItem(item) {
    const settings = await getSettings();
    const isBrowserMethod = settings.collectionDownloadMethod === DOWNLOAD_METHOD_BROWSER;

    let downloadUrl = null;

    if (!item.isNMM && isBrowserMethod) {
      item.status = ITEM_STATUS.RESOLVING;
      // Resolve collection file via background handler
      const resolveResult = await this.deps.resolveCollectionDownload?.({
        fileId: item.fileId,
        gameDomain: item.gameDomain,
        modId: item.modId,
        isNMM: false,
      });

      if (!resolveResult || !resolveResult.url) {
        throw new Error(resolveResult?.error || 'Failed to resolve download URL');
      }
      downloadUrl = resolveResult.url;
    } else {
      // Mod Manager NXM URL
      downloadUrl = `nxm://${item.gameDomain}/mods/${item.modId}/files/${item.fileId}`;
    }

    item.status = ITEM_STATUS.DOWNLOADING;
    await this.persist();

    if (downloadUrl.startsWith('nxm://')) {
      // Dispatch NXM protocol download
      await this.deps.dispatchNxmUrl?.(downloadUrl, item);
      return { ok: true, isNMM: true };
    }

    if (!isSafeDownloadUrl(downloadUrl)) {
      throw new Error('Unsafe download URL rejected');
    }

    // Direct browser download
    const startResult = await this.deps.startDownload?.({
      url: downloadUrl,
      item,
    });

    if (!startResult || !startResult.success) {
      throw new Error(startResult?.error || 'Browser download initiation failed');
    }

    return { ok: true, downloadId: startResult.downloadId };
  }

  async onQueueCompleted() {
    log.info('Queue processing completed', { total: this.items.length });
    const settings = await getSettings();
    if (settings.notifyOnQueueCompletion && typeof chrome !== 'undefined' && chrome.notifications) {
      try {
        const completed = this.items.filter((i) => i.status === ITEM_STATUS.COMPLETED).length;
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'assets/icon-128.png',
          title: 'Nexus Download Queue Finished',
          message: `Successfully processed ${completed} mod file(s).`,
          priority: 2,
        });
      } catch {
        /* ignore notification errors */
      }
    }
  }
}
