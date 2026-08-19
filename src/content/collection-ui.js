import {
  MESSAGE_TYPES,
  DOWNLOAD_METHOD_VORTEX,
  DOWNLOAD_METHOD_BROWSER,
} from '../shared/constants.js';
import { createLogger } from '../shared/logger.js';

const log = createLogger('collection-ui');

function getModFileId(mod) {
  const id = mod?.file?.fileId ?? mod?.fileId;
  return id != null && id !== '' ? String(id) : '';
}
function convertSize(sizeInKB) {
  if (!sizeInKB || isNaN(sizeInKB)) return '0 MB';
  const sizeInMB = sizeInKB / 1024;
  const sizeInGB = sizeInMB / 1024;
  return sizeInGB >= 1
    ? `${sizeInGB.toFixed(2)} GB`
    : `${sizeInMB.toFixed(2)} MB`;
}

function triggerDownloadViaIframe(url) {
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.src = url;
  document.body.appendChild(iframe);
  // Clean up after the protocol handler or download has had time to fire
  setTimeout(() => {
    try { iframe.remove(); } catch { /* already removed */ }
  }, 10000);
}

function sendMessage(type, payload = {}) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage({ type, payload }, (res) => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        if (res && res.success === false) {
          const err = new Error(res.error || 'Request failed');
          err.code = res.code;
          return reject(err);
        }
        resolve(res && res.result !== undefined ? res.result : res);
      });
    } catch (e) {
      reject(e);
    }
  });
}

export class CollectionManager {
  constructor(gameDomain, collectionSlug, revisionNumber = null) {
    this.gameDomain = gameDomain;
    this.collectionSlug = collectionSlug;
    this.revisionNumber = revisionNumber;
    this.downloadMethod = DOWNLOAD_METHOD_VORTEX;
    this.downloadSpeed = 1.5;
    this.pauseBetweenDownload = 5;
    this.isRunning = false;
    this.aborted = false;
    this.pauseTimer = null;
    this.pauseResolve = null;
    this.runToken = 0;
    this.mods = { all: [], mandatory: [], optional: [] };
    this.element = document.createElement('div');
    this.element.className = 'nxdt-collection-panel';
    this.element.setAttribute('data-nxdt-collection', 'true');
    this.progressBar = new CollectionProgressBar(this);
    this.console = new CollectionLogConsole();
    this.downloadButton = new CollectionDownloadButton(this);
  }

  async init() {
    this.element.innerHTML = `
      <div class="nxdt-loading-btn">
        Fetching Collection Mods...
      </div>
    `;

    try {
      const res = await sendMessage(MESSAGE_TYPES.GET_SETTINGS);
      if (res?.settings) {
        this.downloadMethod = res.settings.collectionDownloadMethod ?? DOWNLOAD_METHOD_VORTEX;
        this.downloadSpeed = res.settings.collectionDownloadSpeed ?? 1.5;
        this.pauseBetweenDownload = res.settings.collectionPauseBetweenDownload ?? 1.5;
      }
    } catch (e) {
      log.warn('Failed to load settings', { error: e?.message });
    }

    let revisionData;
    try {
      const res = await sendMessage(MESSAGE_TYPES.FETCH_COLLECTION_MODS, {
        gameDomain: this.gameDomain,
        collectionSlug: this.collectionSlug,
        revision: this.revisionNumber,
      });
      revisionData = res?.collectionRevision;
    } catch (e) {
      this.element.innerHTML = '';
      const errorDiv = document.createElement('div');
      errorDiv.className = 'nxdt-panel-error';
      errorDiv.textContent = `Failed to load collection data: ${e?.message || 'Network error'}`;
      this.element.appendChild(errorDiv);
      return;
    }

    if (!revisionData || !revisionData.modFiles) {
      this.element.innerHTML = `
        <div class="nxdt-panel-warn">
          No mod files found in this collection revision.
        </div>
      `;
      return;
    }

    const mods = revisionData.modFiles.sort((a, b) => {
      const nameA = a.file?.mod?.name || '';
      const nameB = b.file?.mod?.name || '';
      return nameA.localeCompare(nameB);
    });

    const mandatoryMods = mods.filter((m) => !m.optional);
    const optionalMods = mods.filter((m) => m.optional);

    this.mods = {
      all: mods,
      mandatory: mandatoryMods,
      optional: optionalMods,
    };

    this.element.innerHTML = '';
    this.downloadButton.render();
    this.element.appendChild(this.downloadButton.element);
    this.element.appendChild(this.progressBar.element);
    this.element.appendChild(this.console.element);
  }

  async fetchDownloadUrl(mod, downloadMethod = this.downloadMethod) {
    const domain = mod.file?.mod?.game?.domainName || this.gameDomain;
    const fileId = getModFileId(mod);
    const gameId = mod.file?.mod?.game?.id || '0';
    const isNMM = downloadMethod === DOWNLOAD_METHOD_VORTEX;

    if (!fileId) {
      return { downloadUrl: '', error: 'Missing fileId' };
    }

    try {
      const res = await sendMessage(MESSAGE_TYPES.RESOLVE_COLLECTION_DOWNLOAD, {
        fileId: String(fileId),
        gameId: String(gameId),
        gameDomain: domain,
        isNMM,
        modId: mod.file?.mod?.modId,
      });

      if (res?.url) {
        return { downloadUrl: res.url, error: null };
      }
      return { downloadUrl: '', error: res?.error || 'Failed to resolve download URL' };
    } catch (e) {
      return { downloadUrl: '', error: e?.message || 'Resolution error' };
    }
  }

  async getHistory() {
    try {
      const res = await sendMessage(MESSAGE_TYPES.GET_COLLECTION_HISTORY);
      return res?.history || {};
    } catch {
      return {};
    }
  }

  async updateHistory(type, fileId) {
    try {
      await sendMessage(MESSAGE_TYPES.SET_COLLECTION_HISTORY, {
        gameDomain: this.gameDomain,
        collectionSlug: this.collectionSlug,
        type,
        fileIds: [fileId],
      });
    } catch (e) {
      log.warn('Failed to update history', { error: e?.message });
    }
  }

  async downloadMods(modsList, type = 'all') {
    if (!modsList || !modsList.length) return;
    if (this.isRunning) {
      log.warn('Download already in progress, ignoring request.');
      return;
    }

    this.isRunning = true;
    this.aborted = false;
    const runToken = ++this.runToken;
    const downloadMethod = this.downloadMethod;

    try {
      this.startDownload(modsList.length);
      const history = await this.getHistory();
      const downloadedHistory = history?.[this.gameDomain]?.[this.collectionSlug]?.[type] || [];
      const failedDownloads = [];
      let completedCount = 0;
      let skippedCount = 0;

      for (let index = 0; index < modsList.length; index++) {
        const mod = modsList[index];
        const modNumber = `${index + 1}/${modsList.length}`;
        const modName = mod.file?.name || mod.file?.mod?.name || 'Unknown Mod';
        const fileId = getModFileId(mod);

        if (this.aborted || runToken !== this.runToken) break;

        this.progressBar.setCurrentMod(modName);

        if (downloadedHistory.includes(fileId)) {
          this.console.log(`[${modNumber}] Skipped (already downloaded): ${modName}`);
          this.progressBar.incrementProgress();
          skippedCount++;
          continue;
        }

        const { downloadUrl, error } = await this.fetchDownloadUrl(mod, downloadMethod);
        if (this.aborted || runToken !== this.runToken) break;

        if (!downloadUrl) {
          this.console.log(`[${modNumber}] Error resolving ${modName}: ${error}`, 'ERROR');
          failedDownloads.push(mod);
        } else if (downloadUrl.startsWith('nxm://')) {
          this.console.log(`[${modNumber}] Sent to Mod Manager: ${modName} (${convertSize(mod.file?.size)})`);
          triggerDownloadViaIframe(downloadUrl);
          await this.updateHistory(type, fileId);
          if (this.aborted || runToken !== this.runToken) break;
          this.progressBar.incrementProgress();
          completedCount++;
        } else {
          this.console.log(`[${modNumber}] Downloading: ${modName} (${convertSize(mod.file?.size)})`);
          let started = false;
          try {
            const res = await sendMessage(MESSAGE_TYPES.START_DOWNLOAD, { url: downloadUrl });
            if (res === undefined || res.success === false) {
              throw new Error(res?.error || 'Download failed to start');
            }
            started = true;
          } catch (e) {
            this.console.log(`[${modNumber}] Download failed: ${modName}: ${e?.message}`, 'ERROR');
            failedDownloads.push(mod);
          }
          if (this.aborted || runToken !== this.runToken) break;
          if (!started) continue;
          await this.updateHistory(type, fileId);
          if (this.aborted || runToken !== this.runToken) break;
          this.progressBar.incrementProgress();
          completedCount++;
        }
        // Pause calculation between downloads
        if (index < modsList.length - 1) {
          const fileSizeKB = mod.file?.size || 1024;
          const calcPause =
            this.pauseBetweenDownload === 0
              ? 0
              : Math.round(fileSizeKB / 1024 / this.downloadSpeed) + this.pauseBetweenDownload;

          let remaining = calcPause;
          await new Promise((resolve) => {
            this.pauseResolve = resolve;
            const timer = setInterval(() => {
              if (
                this.aborted ||
                runToken !== this.runToken ||
                this.progressBar.skipPause ||
                this.progressBar.status === CollectionProgressBar.STATUS_STOPPED
              ) {
                this.progressBar.skipPause = false;
                clearInterval(timer);
                this.pauseTimer = null;
                this.pauseResolve = null;
                return resolve();
              }
              if (this.progressBar.status === CollectionProgressBar.STATUS_PAUSED) {
                return;
              }
              remaining--;
              if (remaining <= 0) {
                clearInterval(timer);
                this.pauseTimer = null;
                this.pauseResolve = null;
                return resolve();
              }
            }, 1000);
            this.pauseTimer = timer;
          });
          if (this.aborted || runToken !== this.runToken) break;
        }
      }

      if (failedDownloads.length > 0) {
        this.console.log(`Failed to resolve ${failedDownloads.length} mod downloads.`, 'ERROR');
        this.downloadButton.setSummary({
          failed: failedDownloads,
          completed: completedCount,
          skipped: skippedCount,
          type,
        });
      } else if (!this.aborted && (completedCount > 0 || skippedCount > 0)) {
        this.downloadButton.setSummary({
          failed: [],
          completed: completedCount,
          skipped: skippedCount,
          type,
        });
      }
    } finally {
      if (runToken === this.runToken) {
        this.endDownload();
        this.isRunning = false;
      }
    }
  }

  startDownload(count) {
    this.downloadButton.setSummary(null);
    this.progressBar.setModsCount(count);
    this.progressBar.setProgress(0);
    this.progressBar.setStatus(CollectionProgressBar.STATUS_DOWNLOADING);
    this.downloadButton.element.style.display = 'none';
    this.progressBar.element.style.display = 'block';
    this.downloadButton.setRadiosDisabled(true);
    this.console.log('Collection download started.', 'INFO');
  }

  endDownload() {
    if (this.progressBar.status !== CollectionProgressBar.STATUS_STOPPED) {
      this.progressBar.setStatus(CollectionProgressBar.STATUS_FINISHED);
      this.console.log('Collection download completed.', 'INFO');
    }
    this.progressBar.element.style.display = 'none';
    this.downloadButton.element.style.display = 'flex';
    this.downloadButton.setRadiosDisabled(false);
    if (!this.aborted) {
      // Fire-and-forget: stats are best-effort, never fail the run over them.
      sendMessage(MESSAGE_TYPES.COLLECTION_FINISHED).catch(() => {});
    }
  }

  abort() {
    this.runToken++;
    this.aborted = true;
    if (this.pauseTimer) {
      clearInterval(this.pauseTimer);
      this.pauseTimer = null;
    }
    if (this.pauseResolve) {
      const resolvePause = this.pauseResolve;
      this.pauseResolve = null;
      resolvePause();
    }
    this.progressBar.setStatus(CollectionProgressBar.STATUS_STOPPED);
    this.progressBar.element.style.display = 'none';
    this.downloadButton.element.style.display = 'flex';
    this.downloadButton.setRadiosDisabled(false);
    this.console.log('Download queue stopped by user.', 'INFO');
    this.isRunning = false;
  }
}

class CollectionDownloadButton {
  constructor(manager) {
    this.manager = manager;
    this.element = document.createElement('div');
    this.element.className = 'nxdt-download-controls';
  }

  render() {
    const isVortex = this.manager.downloadMethod === DOWNLOAD_METHOD_VORTEX;
    const totalCount = this.manager.mods.all.length;
    const mandatoryCount = this.manager.mods.mandatory.length;
    this.element.innerHTML = `
      <div class="nxdt-segmented" role="radiogroup" aria-label="Download method">
        <label class="nxdt-seg-btn">
          <input type="radio" name="nxdtMethod" value="${DOWNLOAD_METHOD_VORTEX}" ${isVortex ? 'checked' : ''} />
          <span>Send to Vortex / MO2</span>
        </label>
        <label class="nxdt-seg-btn">
          <input type="radio" name="nxdtMethod" value="${DOWNLOAD_METHOD_BROWSER}" ${!isVortex ? 'checked' : ''} />
          <span>Browser Direct Download</span>
        </label>
      </div>
      <button id="nxdtDownloadAll" class="nxdt-btn-hero" title="Download All Mods">
        <span>Download All Mods</span>
        <span class="nxdt-btn-hero-badge">${totalCount} mods</span>
      </button>
      <div class="nxdt-secondary-row">
        <button id="nxdtDownloadMandatory" class="nxdt-btn-secondary" title="Download Mandatory Mods Only">
          Mandatory (${mandatoryCount})
        </button>
        <button id="nxdtSelectMods" class="nxdt-btn-secondary">Select Mods</button>
        <button id="nxdtUpdateCollection" class="nxdt-btn-secondary">Update Diff</button>
      </div>
      <div class="nxdt-queue-row" style="margin-top: 6px; display:flex; gap:6px;">
        <button id="nxdtQueueBackground" class="nxdt-btn-secondary" style="flex:1; border-color:#da8e35;color:#da8e35;font-weight:600;" title="Add all collection mods to background persistent queue">⚡ Queue All to Background</button>
        <button id="nxdtVerifyDownloads" class="nxdt-btn-secondary" style="border-color:#58a6ff;color:#58a6ff;font-weight:600;" title="Scan downloads and check for missing files">🔍 Verify</button>
      </div>
      <div id="nxdtDownloadSummary" style="display:none;"></div>
    `;

    const radioButtons = this.element.querySelectorAll('input[name="nxdtMethod"]');
    radioButtons.forEach((rb) => {
      rb.addEventListener('change', (e) => {
        this.manager.downloadMethod = parseInt(e.target.value, 10);
      });
    });

    this.element.querySelector('#nxdtDownloadAll').addEventListener('click', () => {
      this.manager.downloadMods(this.manager.mods.all, 'all');
    });

    this.element.querySelector('#nxdtDownloadMandatory').addEventListener('click', () => {
      this.manager.downloadMods(this.manager.mods.mandatory, 'mandatory');
    });

    this.element.querySelector('#nxdtSelectMods').addEventListener('click', () => {
      const modal = new CollectionSelectModal(this.manager);
      document.body.appendChild(modal.element);
      modal.render();
    });

    this.element.querySelector('#nxdtUpdateCollection').addEventListener('click', () => {
      const modal = new CollectionUpdateModal(this.manager);
      document.body.appendChild(modal.element);
      modal.render();
    });

    this.element.querySelector('#nxdtVerifyDownloads')?.addEventListener('click', () => {
      const modal = new CollectionVerificationModal(this.manager);
      document.body.appendChild(modal.element);
      modal.render();
    });

    this.element.querySelector('#nxdtQueueBackground')?.addEventListener('click', async () => {
      const queueBtn = this.element.querySelector('#nxdtQueueBackground');
      const isVortex = this.manager.downloadMethod === DOWNLOAD_METHOD_VORTEX;
      const items = this.manager.mods.all.map((m) => ({
        fileId: m.fileId || m.file?.fileId,
        modId: m.file?.mod?.modId || '0',
        gameDomain: m.file?.mod?.game?.domainName || this.manager.gameDomain,
        modName: m.file?.mod?.name || m.file?.name || 'Collection Mod',
        fileName: m.file?.name || `${m.fileId}.zip`,
        fileSize: m.file?.size || 0,
        fileVersion: m.file?.version || '',
        isNMM: isVortex,
        isOptional: !!m.optional,
        sourceUrl: window.location.href,
      }));

      try {
        await sendMessage(MESSAGE_TYPES.ENQUEUE_ITEMS, { items });
        if (queueBtn) {
          queueBtn.textContent = '✓ Queued to Background!';
          setTimeout(() => {
            queueBtn.textContent = '⚡ Queue to Background';
          }, 2000);
        }
      } catch (err) {
        log.warn('Failed to enqueue collection', { error: err?.message });
      }
    });
  }

  setRadiosDisabled(disabled) {
    this.element.querySelectorAll('input[name="nxdtMethod"]').forEach((rb) => {
      rb.disabled = disabled;
    });
  }
  setSummary(summaryData) {
    const summaryEl = this.element.querySelector('#nxdtDownloadSummary');
    if (!summaryEl) return;
    if (!summaryData) {
      summaryEl.style.display = 'none';
      summaryEl.innerHTML = '';
      return;
    }

    const { failed = [], completed = 0, skipped = 0, type = 'all' } = summaryData;
    if (failed.length > 0) {
      summaryEl.className = 'nxdt-panel-error';
      summaryEl.style.display = 'block';
      summaryEl.style.marginTop = '8px';
      summaryEl.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:8px;flex-wrap:wrap;">
          <span style="font-weight:600;">⚠️ ${failed.length} mod download(s) failed</span>
          <div style="display:flex;gap:6px;align-items:center;">
            <button type="button" id="nxdtOpenFailedExternal" class="nxdt-btn-sm" style="background:#292e36;color:#58a6ff;border:1px solid #444c56;cursor:pointer;" title="Open pages for failed items">Open External Links</button>
            <button type="button" id="nxdtRetryFailed" class="nxdt-btn-sm" style="background:#da8e35;color:#fff;border:none;cursor:pointer;font-weight:600;">Retry Failed (${failed.length})</button>
          </div>
        </div>
        <div class="nxdt-failed-list" style="font-size:11px;color:#f85149;max-height:80px;overflow-y:auto;background:rgba(0,0,0,0.25);padding:6px 8px;border-radius:4px;display:flex;flex-direction:column;gap:2px;">
          ${failed
            .map(
              (m) =>
                `<div>• ${m.file?.name || m.file?.mod?.name || 'Unknown Mod'}</div>`
            )
            .join('')}
        </div>
      `;
      summaryEl.querySelector('#nxdtRetryFailed')?.addEventListener('click', () => {
        this.manager.downloadMods(failed, type);
      });
      summaryEl.querySelector('#nxdtOpenFailedExternal')?.addEventListener('click', () => {
        failed.forEach((mod) => {
          const domain = mod.file?.mod?.game?.domainName || this.manager.gameDomain;
          const modId = mod.file?.mod?.modId || mod.modId;
          const url =
            mod.file?.mod?.url ||
            mod.sourceUrl ||
            mod.externalUrl ||
            (domain && modId ? `https://www.nexusmods.com/${domain}/mods/${modId}` : null);
          if (url && typeof window !== 'undefined' && window.open) {
            window.open(url, '_blank', 'noopener,noreferrer');
          }
        });
      });
    } else if (completed > 0 || skipped > 0) {
      summaryEl.className = 'nxdt-panel-warn';
      summaryEl.style.display = 'block';
      summaryEl.style.color = '#3fb950';
      summaryEl.style.borderColor = 'rgba(63, 185, 80, 0.4)';
      summaryEl.style.marginTop = '8px';
      summaryEl.textContent = `✓ Completed: ${completed} downloaded, ${skipped} skipped`;
    } else {
      summaryEl.style.display = 'none';
      summaryEl.innerHTML = '';
    }
  }

}

export class CollectionProgressBar {
  static STATUS_DOWNLOADING = 0;
  static STATUS_PAUSED = 1;
  static STATUS_FINISHED = 2;
  static STATUS_STOPPED = 3;

  constructor(manager) {
    this.manager = manager;
    this.modsCount = 0;
    this.progress = 0;
    this.skipPause = false;
    this.status = CollectionProgressBar.STATUS_DOWNLOADING;
    this.startTime = null;
    this.currentModName = '';
    this.element = document.createElement('div');
    this.element.className = 'nxdt-progress-container';
    this.element.style.display = 'none';
    this.render();
  }

  setModsCount(count) {
    this.modsCount = count;
    this.startTime = Date.now();
    this.update();
  }

  setCurrentMod(name) {
    this.currentModName = name || '';
    this.update();
  }

  setProgress(prog) {
    this.progress = prog;
    this.update();
  }

  incrementProgress() {
    this.progress++;
    this.update();
  }

  setStatus(stat) {
    this.status = stat;
    this.update();
  }

  render() {
    this.element.innerHTML = `
      <div class="nxdt-progress-track">
        <div id="nxdtProgressFill" class="nxdt-progress-fill" style="width: 0%"></div>
        <div class="nxdt-progress-meta">
          <span id="nxdtPercent">0%</span>
          <span id="nxdtStatusText">Downloading...</span>
          <span id="nxdtCount">0/0</span>
        </div>
        <div class="nxdt-progress-subline" style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px; font-size: 11px; color: #8b949e; min-height: 16px;">
          <span id="nxdtCurrentMod" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 65%;"></span>
          <span id="nxdtProgressEta"></span>
        </div>
      </div>
      <div class="nxdt-progress-actions">
        <div class="nxdt-progress-actions-group">
          <button id="nxdtPlayPause" class="nxdt-progress-btn">Pause</button>
          <button id="nxdtStop" class="nxdt-progress-btn nxdt-progress-btn-danger">Stop</button>
        </div>
        <div class="nxdt-progress-actions-group">
          <button id="nxdtSkipPause" class="nxdt-progress-btn">Skip Wait</button>
        </div>
      </div>
    `;

    this.element.querySelector('#nxdtPlayPause').addEventListener('click', (e) => {
      if (this.status === CollectionProgressBar.STATUS_DOWNLOADING) {
        this.setStatus(CollectionProgressBar.STATUS_PAUSED);
        e.target.textContent = 'Resume';
      } else {
        this.setStatus(CollectionProgressBar.STATUS_DOWNLOADING);
        e.target.textContent = 'Pause';
      }
    });

    this.element.querySelector('#nxdtStop').addEventListener('click', () => {
      this.manager.abort();
    });

    this.element.querySelector('#nxdtSkipPause').addEventListener('click', () => {
      this.skipPause = true;
    });
  }

  update() {
    const pct = this.modsCount > 0 ? ((this.progress / this.modsCount) * 100).toFixed(1) : 0;
    const fill = this.element.querySelector('#nxdtProgressFill');
    const pctText = this.element.querySelector('#nxdtPercent');
    const cntText = this.element.querySelector('#nxdtCount');
    const statText = this.element.querySelector('#nxdtStatusText');
    const curModText = this.element.querySelector('#nxdtCurrentMod');
    const etaText = this.element.querySelector('#nxdtProgressEta');

    if (fill) fill.style.width = `${pct}%`;
    if (pctText) pctText.textContent = `${pct}%`;
    if (cntText) cntText.textContent = `${this.progress}/${this.modsCount}`;
    if (curModText) {
      curModText.textContent = this.currentModName ? `Mod: ${this.currentModName}` : '';
      curModText.title = this.currentModName || '';
    }

    if (statText) {
      if (this.status === CollectionProgressBar.STATUS_PAUSED) statText.textContent = 'Paused';
      else if (this.status === CollectionProgressBar.STATUS_FINISHED) statText.textContent = 'Finished';
      else if (this.status === CollectionProgressBar.STATUS_STOPPED) statText.textContent = 'Stopped';
      else statText.textContent = 'Downloading...';
    }

    if (etaText) {
      if (
        this.status === CollectionProgressBar.STATUS_DOWNLOADING &&
        this.progress > 0 &&
        this.modsCount > this.progress &&
        this.startTime
      ) {
        const elapsedSec = Math.max(1, (Date.now() - this.startTime) / 1000);
        const secPerMod = elapsedSec / this.progress;
        const ratePerMin = ((this.progress / elapsedSec) * 60).toFixed(1);
        const remainingSec = Math.round((this.modsCount - this.progress) * secPerMod);
        if (remainingSec > 0 && isFinite(remainingSec)) {
          let etaStr = '';
          if (remainingSec < 60) {
            etaStr = `~${remainingSec}s left`;
          } else {
            const m = Math.floor(remainingSec / 60);
            const s = remainingSec % 60;
            etaStr = `~${m}m ${s}s left`;
          }
          etaText.textContent = `${etaStr} • ${ratePerMin} mods/min`;
        } else {
          etaText.textContent = '';
        }
      } else {
        etaText.textContent = '';
      }
    }
  }
}

class CollectionLogConsole {
  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'nxdt-console-container';
    this.element.innerHTML = `
      <div class="nxdt-log-toggle" id="nxdtToggleLogs">
        <span>Activity Log</span>
        <span id="nxdtLogState">Hide</span>
      </div>
      <div id="nxdtLogOutput" class="nxdt-log-box"></div>
    `;

    this.output = this.element.querySelector('#nxdtLogOutput');
    const toggle = this.element.querySelector('#nxdtToggleLogs');
    const state = this.element.querySelector('#nxdtLogState');

    toggle.addEventListener('click', () => {
      if (this.output.style.display === 'none') {
        this.output.style.display = 'block';
        state.textContent = 'Hide';
      } else {
        this.output.style.display = 'none';
        state.textContent = 'Show';
      }
    });
  }

  log(message, type = 'NORMAL') {
    const entry = document.createElement('div');
    const time = new Date().toLocaleTimeString();
    if (type === 'ERROR') entry.className = 'nxdt-log-entry-error';
    else if (type === 'INFO') entry.className = 'nxdt-log-entry-info';

    entry.textContent = `[${time}] ${message}`;
    this.output.appendChild(entry);
    this.output.scrollTop = this.output.scrollHeight;
  }
}

export class CollectionSelectModal {
  constructor(manager) {
    this.manager = manager;
    this.element = document.createElement('div');
    this.element.className = 'nxdt-modal-overlay';
    this.element.setAttribute('data-nxdt-modal', 'true');
    this._handleKeydown = (e) => {
      if (e.key === 'Escape') {
        this.close();
      }
    };
  }

  close() {
    document.removeEventListener('keydown', this._handleKeydown);
    this.element.remove();
  }

  render() {
    document.addEventListener('keydown', this._handleKeydown);

    this.element.addEventListener('click', (e) => {
      if (e.target === this.element) {
        this.close();
      }
    });

    this.element.innerHTML = `
      <div class="nxdt-modal-box">
        <div class="nxdt-modal-header">
          <h3>Select Mods to Download</h3>
          <span id="nxdtSelCount" class="nxdt-badge">0 selected</span>
        </div>
        <div class="nxdt-modal-search-bar">
          <input type="search" id="nxdtSearch" placeholder="Search mods..." />
          <button id="nxdtSelAll" class="nxdt-btn-sm">Select All</button>
          <button id="nxdtSelMandatory" class="nxdt-btn-sm">Mandatory Only</button>
          <button id="nxdtDeselAll" class="nxdt-btn-sm">Deselect All</button>
        </div>
        <div id="nxdtModList" class="nxdt-modal-list"></div>
        <div class="nxdt-modal-footer">
          <button id="nxdtCloseSel" class="nxdt-btn-sm">Cancel</button>
          <button id="nxdtStartSel" class="nxdt-btn-primary">Download Selected</button>
        </div>
      </div>
    `;

    const listContainer = this.element.querySelector('#nxdtModList');
    const searchInput = this.element.querySelector('#nxdtSearch');
    const countBadge = this.element.querySelector('#nxdtSelCount');

    // Tracks selection across list rebuilds (search filtering re-creates rows).
    const checkedIds = new Set();

    const updateCount = () => {
      countBadge.textContent = `${checkedIds.size} selected`;
    };

    const renderList = (filter = '') => {
      // Persist the current DOM selection before rows are destroyed.
      listContainer.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        if (cb.checked) checkedIds.add(cb.getAttribute('data-file-id'));
        else checkedIds.delete(cb.getAttribute('data-file-id'));
      });

      listContainer.innerHTML = '';
      const filterLower = filter.toLowerCase();
      this.manager.mods.all.forEach((mod) => {
        const fileId = getModFileId(mod);
        const name = mod.file?.name || mod.file?.mod?.name || 'Unknown Mod';
        if (filterLower && !name.toLowerCase().includes(filterLower)) return;

        const row = document.createElement('label');
        row.className = 'nxdt-modal-row';

        const left = document.createElement('div');
        left.className = 'nxdt-modal-row-left';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.setAttribute('data-file-id', fileId);
        checkbox.checked = checkedIds.has(fileId);

        const title = document.createElement('span');
        title.className = 'nxdt-modal-row-title';
        title.textContent = name;

        left.appendChild(checkbox);
        left.appendChild(title);

        const right = document.createElement('div');
        right.className = 'nxdt-modal-row-right';

        const size = document.createElement('span');
        size.textContent = convertSize(mod.file?.size);

        const tag = document.createElement('span');
        tag.className = mod.optional ? 'nxdt-tag-optional' : 'nxdt-tag-mandatory';
        tag.textContent = mod.optional ? 'Optional' : 'Mandatory';

        right.appendChild(size);
        right.appendChild(tag);

        row.appendChild(left);
        row.appendChild(right);

        checkbox.addEventListener('change', () => {
          if (checkbox.checked) checkedIds.add(checkbox.getAttribute('data-file-id'));
          else checkedIds.delete(checkbox.getAttribute('data-file-id'));
          updateCount();
        });

        listContainer.appendChild(row);
      });

      updateCount();
    };

    renderList();

    searchInput.addEventListener('input', (e) => renderList(e.target.value));

    this.element.querySelector('#nxdtSelAll').addEventListener('click', () => {
      listContainer.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        cb.checked = true;
        checkedIds.add(cb.getAttribute('data-file-id'));
      });
      updateCount();
    });
    this.element.querySelector('#nxdtSelMandatory')?.addEventListener('click', () => {
      this.manager.mods.all.forEach((mod) => {
        const fileId = getModFileId(mod);
        if (!mod.optional) {
          checkedIds.add(fileId);
        } else {
          checkedIds.delete(fileId);
        }
      });
      listContainer.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        const fileId = cb.getAttribute('data-file-id');
        cb.checked = checkedIds.has(fileId);
      });
      updateCount();
    });


    this.element.querySelector('#nxdtDeselAll').addEventListener('click', () => {
      listContainer.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        cb.checked = false;
        checkedIds.delete(cb.getAttribute('data-file-id'));
      });
      updateCount();
    });

    this.element.querySelector('#nxdtCloseSel').addEventListener('click', () => this.close());

    this.element.querySelector('#nxdtStartSel').addEventListener('click', () => {
      const selectedMods = this.manager.mods.all.filter((m) => checkedIds.has(getModFileId(m)));
      this.close();
      this.manager.downloadMods(selectedMods, 'selected');
    });
  }
}

export class CollectionUpdateModal {
  constructor(manager) {
    this.manager = manager;
    this.element = document.createElement('div');
    this.element.className = 'nxdt-modal-overlay';
    this.element.setAttribute('data-nxdt-modal', 'true');
    this._handleKeydown = (e) => {
      if (e.key === 'Escape') {
        this.close();
      }
    };
  }

  close() {
    document.removeEventListener('keydown', this._handleKeydown);
    this.element.remove();
  }

  async render() {
    document.addEventListener('keydown', this._handleKeydown);

    this.element.addEventListener('click', (e) => {
      if (e.target === this.element) {
        this.close();
      }
    });

    this.element.innerHTML = `
      <div class="nxdt-modal-box">
        <div class="nxdt-modal-header">
          <h3>Compare Collection Revisions</h3>
        </div>
        <div class="nxdt-modal-search-bar">
          <select id="nxdtRevFrom" class="nxdt-select-rev"></select>
          <select id="nxdtRevTo" class="nxdt-select-rev"></select>
        </div>
        <div id="nxdtDiffOutput" class="nxdt-modal-list nxdt-diff-output">
          Select revisions above to compare differences.
        </div>
        <div class="nxdt-modal-footer">
          <button id="nxdtCloseDiff" class="nxdt-btn-sm">Close</button>
        </div>
      </div>
    `;

    this.element.querySelector('#nxdtCloseDiff').addEventListener('click', () => this.close());

    try {
      const res = await sendMessage(MESSAGE_TYPES.FETCH_COLLECTION_REVISIONS, {
        gameDomain: this.manager.gameDomain,
        collectionSlug: this.manager.collectionSlug,
      });
      const revisions = res?.revisions || [];
      const selFrom = this.element.querySelector('#nxdtRevFrom');
      const selTo = this.element.querySelector('#nxdtRevTo');

      revisions.forEach((r) => {
        const opt = document.createElement('option');
        opt.value = r.revisionNumber;
        opt.textContent = `Revision ${r.revisionNumber} (${(r.totalSize / (1024 * 1024)).toFixed(1)} MB)`;
        selFrom.appendChild(opt.cloneNode(true));
        selTo.appendChild(opt);
      });

      const compare = async () => {
        const revA = parseInt(selFrom.value, 10);
        const revB = parseInt(selTo.value, 10);
        if (!revA || !revB) return;

        const diffOutput = this.element.querySelector('#nxdtDiffOutput');
        diffOutput.textContent = 'Comparing revisions...';

        const [resA, resB] = await Promise.all([
          sendMessage(MESSAGE_TYPES.FETCH_COLLECTION_MODS, {
            gameDomain: this.manager.gameDomain,
            collectionSlug: this.manager.collectionSlug,
            revision: revA,
          }),
          sendMessage(MESSAGE_TYPES.FETCH_COLLECTION_MODS, {
            gameDomain: this.manager.gameDomain,
            collectionSlug: this.manager.collectionSlug,
            revision: revB,
          }),
        ]);

        const modsA = resA?.collectionRevision?.modFiles || [];
        const modsB = resB?.collectionRevision?.modFiles || [];

        const idsA = new Set(modsA.map((m) => String(m.fileId)));
        const idsB = new Set(modsB.map((m) => String(m.fileId)));

        const added = modsB.filter((m) => !idsA.has(String(m.fileId)));
        const removed = modsA.filter((m) => !idsB.has(String(m.fileId)));

        const nameOf = (m) => m.file?.name || m.file?.mod?.name;

        const wrap = document.createElement('div');
        wrap.className = 'space-y-2';

        const addHeader = document.createElement('div');
        addHeader.className = 'text-green-400 font-semibold';
        addHeader.textContent = `Added in Rev ${revB} (${added.length}):`;
        const addList = document.createElement('ul');
        addList.className = 'list-disc list-inside space-y-0.5 text-gray-300';
        if (added.length === 0) {
          const li = document.createElement('li');
          li.textContent = 'None';
          addList.appendChild(li);
        } else {
          added.forEach((m) => {
            const li = document.createElement('li');
            li.textContent = nameOf(m);
            addList.appendChild(li);
          });
        }

        const remHeader = document.createElement('div');
        remHeader.className = 'text-red-400 font-semibold mt-2';
        remHeader.textContent = `Removed in Rev ${revB} (${removed.length}):`;
        const remList = document.createElement('ul');
        remList.className = 'list-disc list-inside space-y-0.5 text-gray-300';
        if (removed.length === 0) {
          const li = document.createElement('li');
          li.textContent = 'None';
          remList.appendChild(li);
        } else {
          removed.forEach((m) => {
            const li = document.createElement('li');
            li.textContent = nameOf(m);
            remList.appendChild(li);
          });
        }

        wrap.appendChild(addHeader);
        wrap.appendChild(addList);
        wrap.appendChild(remHeader);
        wrap.appendChild(remList);

        diffOutput.textContent = '';
        diffOutput.appendChild(wrap);
      };

      selFrom.addEventListener('change', compare);
      selTo.addEventListener('change', compare);
    } catch (e) {
      log.warn('Failed to load revisions for diff', { error: e?.message });
    }
  }
}

export class CollectionVerificationModal {
  constructor(manager) {
    this.manager = manager;
    this.element = document.createElement('div');
    this.element.className = 'nxdt-modal-overlay';
    this.element.setAttribute('data-nxdt-modal', 'true');
    this.verificationData = null;
    this.activeFilter = 'all';
    this._handleKeydown = (e) => {
      if (e.key === 'Escape') {
        this.close();
      }
    };
  }

  close() {
    document.removeEventListener('keydown', this._handleKeydown);
    this.element.remove();
  }

  async render() {
    document.addEventListener('keydown', this._handleKeydown);

    this.element.addEventListener('click', (e) => {
      if (e.target === this.element) {
        this.close();
      }
    });
    this.element.innerHTML = `
      <div class="nxdt-modal-box" style="max-width: 600px;">
        <div class="nxdt-modal-header">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:18px;">🔍</span>
            <h3>Download Verification & Integrity Scanner</h3>
          </div>
          <button id="nxdtCloseVerifHeader" class="nxdt-btn-icon">✕</button>
        </div>
        <div id="nxdtVerifBody" style="padding: 16px 20px;">
          <div style="text-align:center;padding:30px;color:#8b949e;">
            <span class="nxdt-dock-spinner" style="display:inline-block;margin-bottom:12px;"></span>
            <div>Scanning browser downloads & collection history...</div>
          </div>
        </div>
      </div>
    `;

    this.element.querySelector('#nxdtCloseVerifHeader')?.addEventListener('click', () => this.close());

    try {
      const modFiles = this.manager.mods.all.map((m) => ({
        fileId: m.fileId || m.file?.fileId,
        fileName: m.file?.name || `${m.fileId}.zip`,
        modName: m.file?.mod?.name || m.file?.name || 'Collection Mod',
        fileSize: m.file?.size || 0,
        modId: m.file?.mod?.modId || '0',
        optional: !!m.optional,
      }));

      const res = await sendMessage(MESSAGE_TYPES.VERIFY_COLLECTION_DOWNLOADS, {
        gameDomain: this.manager.gameDomain,
        collectionSlug: this.manager.collectionSlug,
        modFiles,
      });

      this.verificationData = res || { total: 0, confirmed: 0, missing: 0, percentage: 0, results: [] };
      this.renderReport();
    } catch (e) {
      const body = this.element.querySelector('#nxdtVerifBody');
      if (body) {
        body.innerHTML = `<div class="nxdt-panel-error">Verification scan failed: ${e?.message || 'Unknown error'}</div>`;
      }
    }
  }

  renderReport() {
    const { total, confirmed, missing, percentage, results = [] } = this.verificationData;
    const body = this.element.querySelector('#nxdtVerifBody');
    if (!body) return;

    body.innerHTML = `
      <div style="margin-bottom: 16px; background: rgba(30, 34, 40, 0.7); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; padding: 14px 16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">
          <span style="font-size:14px; font-weight:700; color:#f0f6fc;">
            ${confirmed === total ? '🎉 Collection 100% Downloaded!' : 'Verification Scan Complete'}
          </span>
          <span style="font-size:13px; font-weight:700; color:#da8e35;">${percentage}% Complete</span>
        </div>
        <div class="nxdt-progress-bar-track" style="height: 10px; margin-bottom: 12px;">
          <div class="nxdt-progress-bar-fill" style="width: ${percentage}%;"></div>
        </div>
        <div style="display:flex; gap: 16px; font-size:12px; color:#8b949e;">
          <span>Total Mods: <b style="color:#e6edf3;">${total}</b></span>
          <span>Confirmed: <b style="color:#3fb950;">${confirmed}</b></span>
          <span>Missing: <b style="color:${missing > 0 ? '#f85149' : '#3fb950'};">${missing}</b></span>
        </div>
      </div>

      <div class="nxdt-modal-search-bar" style="margin-bottom: 12px; display:flex; gap:8px;">
        <input type="search" id="nxdtVerifSearch" placeholder="Filter files..." style="flex:1;" />
        <button id="nxdtFilterAll" class="nxdt-btn-sm ${this.activeFilter === 'all' ? 'nxdt-btn-active' : ''}">All (${total})</button>
        <button id="nxdtFilterMissing" class="nxdt-btn-sm ${this.activeFilter === 'missing' ? 'nxdt-btn-active' : ''}">Missing (${missing})</button>
        <button id="nxdtFilterConfirmed" class="nxdt-btn-sm ${this.activeFilter === 'confirmed' ? 'nxdt-btn-active' : ''}">Confirmed (${confirmed})</button>
      </div>

      <div id="nxdtVerifList" class="nxdt-modal-list" style="max-height: 260px; overflow-y:auto;"></div>

      <div class="nxdt-modal-footer" style="margin-top: 14px;">
        <button id="nxdtCloseVerif" class="nxdt-btn-sm">Close</button>
        ${
          missing > 0
            ? `<button id="nxdtDownloadMissing" class="nxdt-btn-primary" style="background:#da8e35;color:#fff;">⚡ Download Missing Only (${missing})</button>`
            : `<button id="nxdtCloseVerif2" class="nxdt-btn-primary" style="background:#3fb950;color:#fff;">✓ Everything Downloaded</button>`
        }
      </div>
    `;

    const listContainer = body.querySelector('#nxdtVerifList');
    const searchInput = body.querySelector('#nxdtVerifSearch');

    const renderList = (filterText = '') => {
      listContainer.innerHTML = '';
      const textLower = filterText.toLowerCase();

      const filtered = results.filter((item) => {
        if (this.activeFilter === 'missing' && item.confirmed) return false;
        if (this.activeFilter === 'confirmed' && !item.confirmed) return false;
        if (
          textLower &&
          !item.modName.toLowerCase().includes(textLower) &&
          !item.fileName.toLowerCase().includes(textLower)
        ) {
          return false;
        }
        return true;
      });

      if (filtered.length === 0) {
        listContainer.innerHTML = `<div style="text-align:center;padding:20px;color:#8b949e;font-size:12px;">No matching items found.</div>`;
        return;
      }

      filtered.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'nxdt-modal-row';
        row.style.cursor = 'default';

        const left = document.createElement('div');
        left.className = 'nxdt-modal-row-left';
        left.innerHTML = `
          <span style="font-size:14px;">${item.confirmed ? '✅' : '❌'}</span>
          <div>
            <div class="nxdt-modal-row-title">${item.modName}</div>
            <div style="font-size:11px;color:#8b949e;">${item.fileName} • ${convertSize(item.fileSize)}</div>
          </div>
        `;

        const right = document.createElement('div');
        right.className = 'nxdt-modal-row-right';
        right.innerHTML = `
          <span class="nxdt-pill-tag ${item.isOptional ? 'nxdt-tag-optional' : 'nxdt-tag-mandatory'}">
            ${item.isOptional ? 'Optional' : 'Mandatory'}
          </span>
          <span style="font-size:11px;font-weight:600;color:${item.confirmed ? '#3fb950' : '#f85149'};">
            ${item.confirmed ? 'Downloaded' : 'Missing'}
          </span>
        `;

        row.appendChild(left);
        row.appendChild(right);
        listContainer.appendChild(row);
      });
    };

    renderList();

    searchInput?.addEventListener('input', (e) => renderList(e.target.value));

    body.querySelector('#nxdtFilterAll')?.addEventListener('click', () => {
      this.activeFilter = 'all';
      this.renderReport();
    });
    body.querySelector('#nxdtFilterMissing')?.addEventListener('click', () => {
      this.activeFilter = 'missing';
      this.renderReport();
    });
    body.querySelector('#nxdtFilterConfirmed')?.addEventListener('click', () => {
      this.activeFilter = 'confirmed';
      this.renderReport();
    });

    body.querySelector('#nxdtCloseVerif')?.addEventListener('click', () => this.close());
    body.querySelector('#nxdtCloseVerif2')?.addEventListener('click', () => this.close());

    body.querySelector('#nxdtDownloadMissing')?.addEventListener('click', async () => {
      const missingItems = results.filter((r) => !r.confirmed);
      const isVortex = this.manager.downloadMethod === DOWNLOAD_METHOD_VORTEX;
      const itemsToQueue = missingItems.map((m) => ({
        fileId: m.fileId,
        modId: m.modId || '0',
        gameDomain: this.manager.gameDomain,
        modName: m.modName,
        fileName: m.fileName || `${m.fileId}.zip`,
        fileSize: m.fileSize || 0,
        isNMM: isVortex,
        isOptional: !!m.isOptional,
        sourceUrl: window.location.href,
      }));

      try {
        await sendMessage(MESSAGE_TYPES.ENQUEUE_ITEMS, { items: itemsToQueue });
        alert(`Successfully queued ${itemsToQueue.length} missing mod(s) to the background queue!`);
        this.close();
      } catch (err) {
        log.warn('Failed to enqueue missing mods', { error: err?.message });
      }
    });
  }
}

