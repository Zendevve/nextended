import {
  MESSAGE_TYPES,
  DOWNLOAD_METHOD_VORTEX,
  DOWNLOAD_METHOD_BROWSER,
} from '../shared/constants.js';
import { createLogger } from '../shared/logger.js';

const log = createLogger('collection-ui');

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
    const fileId = mod.file?.fileId || mod.fileId;
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

      for (let index = 0; index < modsList.length; index++) {
        const mod = modsList[index];
        const modNumber = `${index + 1}/${modsList.length}`;
        const modName = mod.file?.name || mod.file?.mod?.name || 'Unknown Mod';
        const fileId = String(mod.fileId);

        if (this.aborted || runToken !== this.runToken) break;

        if (downloadedHistory.includes(fileId)) {
          this.console.log(`[${modNumber}] Skipped (already downloaded): ${modName}`);
          this.progressBar.incrementProgress();
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
      }
    } finally {
      if (runToken === this.runToken) {
        this.endDownload();
        this.isRunning = false;
      }
    }
  }

  startDownload(count) {
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
  }

  setRadiosDisabled(disabled) {
    this.element.querySelectorAll('input[name="nxdtMethod"]').forEach((rb) => {
      rb.disabled = disabled;
    });
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
    this.element = document.createElement('div');
    this.element.className = 'nxdt-progress-container';
    this.element.style.display = 'none';
    this.render();
  }

  setModsCount(count) {
    this.modsCount = count;
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

    if (fill) fill.style.width = `${pct}%`;
    if (pctText) pctText.textContent = `${pct}%`;
    if (cntText) cntText.textContent = `${this.progress}/${this.modsCount}`;
    if (statText) {
      if (this.status === CollectionProgressBar.STATUS_PAUSED) statText.textContent = 'Paused';
      else if (this.status === CollectionProgressBar.STATUS_FINISHED) statText.textContent = 'Finished';
      else if (this.status === CollectionProgressBar.STATUS_STOPPED) statText.textContent = 'Stopped';
      else statText.textContent = 'Downloading...';
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
  }

  render() {
    this.element.innerHTML = `
      <div class="nxdt-modal-box">
        <div class="nxdt-modal-header">
          <h3>Select Mods to Download</h3>
          <span id="nxdtSelCount" class="nxdt-badge">0 selected</span>
        </div>
        <div class="nxdt-modal-search-bar">
          <input type="search" id="nxdtSearch" placeholder="Search mods..." />
          <button id="nxdtSelAll" class="nxdt-btn-sm">Select All</button>
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
        const name = mod.file?.name || mod.file?.mod?.name || 'Unknown Mod';
        if (filterLower && !name.toLowerCase().includes(filterLower)) return;

        const row = document.createElement('label');
        row.className = 'nxdt-modal-row';

        const left = document.createElement('div');
        left.className = 'nxdt-modal-row-left';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.setAttribute('data-file-id', String(mod.fileId));
        checkbox.checked = checkedIds.has(String(mod.fileId));

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

    this.element.querySelector('#nxdtDeselAll').addEventListener('click', () => {
      listContainer.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        cb.checked = false;
        checkedIds.delete(cb.getAttribute('data-file-id'));
      });
      updateCount();
    });

    this.element.querySelector('#nxdtCloseSel').addEventListener('click', () => this.element.remove());

    this.element.querySelector('#nxdtStartSel').addEventListener('click', () => {
      const selectedMods = this.manager.mods.all.filter((m) => checkedIds.has(String(m.fileId)));
      this.element.remove();
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
  }

  async render() {
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

    this.element.querySelector('#nxdtCloseDiff').addEventListener('click', () => this.element.remove());

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
