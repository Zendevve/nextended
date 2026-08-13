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
  }, 30000);
}

function sendMessage(type, payload = {}) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage({ type, payload }, (res) => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        if (res && res.success === false) {
          return reject(new Error(res.error || 'Request failed'));
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
    this.mods = { all: [], mandatory: [], optional: [] };
    this.element = document.createElement('div');
    this.element.className = 'nxdt-collection-panel bg-surface-low w-full space-y-3 rounded-lg p-4 mt-4';
    this.element.setAttribute('data-nxdt-collection', 'true');
    this.progressBar = new CollectionProgressBar(this);
    this.console = new CollectionLogConsole();
    this.downloadButton = new CollectionDownloadButton(this);
  }

  async init() {
    this.element.innerHTML = `
      <div class="nxdt-loading-btn w-full font-montserrat font-semibold text-sm leading-none uppercase flex justify-center items-center px-4 py-3 bg-primary-moderate text-font-primary rounded">
        Fetching Collection Mods...
      </div>
    `;

    try {
      const res = await sendMessage(MESSAGE_TYPES.GET_SETTINGS);
      if (res?.settings) {
        this.downloadMethod = res.settings.collectionDownloadMethod ?? DOWNLOAD_METHOD_VORTEX;
        this.downloadSpeed = res.settings.collectionDownloadSpeed ?? 1.5;
        this.pauseBetweenDownload = res.settings.collectionPauseBetweenDownload ?? 5;
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
      this.element.innerHTML = `
        <div class="w-full text-red-500 font-semibold text-sm p-3 bg-surface-mid rounded">
          Failed to load collection data: ${e?.message || 'Network error'}
        </div>
      `;
      return;
    }

    if (!revisionData || !revisionData.modFiles) {
      this.element.innerHTML = `
        <div class="w-full text-amber-500 font-semibold text-sm p-3 bg-surface-mid rounded">
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

  async fetchDownloadUrl(mod) {
    const domain = mod.file?.mod?.game?.domainName || this.gameDomain;
    const fileId = mod.file?.fileId || mod.fileId;
    const gameId = mod.file?.mod?.game?.id || '0';
    const isNMM = this.downloadMethod === DOWNLOAD_METHOD_VORTEX;

    if (!fileId) {
      return { downloadUrl: '', error: 'Missing fileId' };
    }

    try {
      const res = await sendMessage(MESSAGE_TYPES.RESOLVE_COLLECTION_DOWNLOAD, {
        fileId: String(fileId),
        gameId: String(gameId),
        gameDomain: domain,
        isNMM,
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
      const history = await this.getHistory();
      history[this.gameDomain] = history[this.gameDomain] || {};
      history[this.gameDomain][this.collectionSlug] = history[this.gameDomain][this.collectionSlug] || {};
      history[this.gameDomain][this.collectionSlug][type] = history[this.gameDomain][this.collectionSlug][type] || [];
      if (!history[this.gameDomain][this.collectionSlug][type].includes(fileId)) {
        history[this.gameDomain][this.collectionSlug][type].push(fileId);
      }
      await sendMessage(MESSAGE_TYPES.SET_COLLECTION_HISTORY, { history });
    } catch (e) {
      log.warn('Failed to update history', { error: e?.message });
    }
  }

  async downloadMods(modsList, type = 'all') {
    if (!modsList || !modsList.length) return;

    this.startDownload(modsList.length);
    const history = await this.getHistory();
    const downloadedHistory = history?.[this.gameDomain]?.[this.collectionSlug]?.[type] || [];

    if (downloadedHistory.length > 0) {
      const confirmSkip = window.confirm(
        `You already downloaded ${downloadedHistory.length} of ${modsList.length} mods from this collection.\n` +
          `Skip previously downloaded mods?\nCancel will re-download all files.`
      );
      if (!confirmSkip) {
        history[this.gameDomain][this.collectionSlug][type] = [];
        await sendMessage(MESSAGE_TYPES.SET_COLLECTION_HISTORY, { history });
      }
    }

    const failedDownloads = [];

    for (let index = 0; index < modsList.length; index++) {
      const mod = modsList[index];
      const modNumber = `${index + 1}/${modsList.length}`;
      const modName = mod.file?.name || mod.file?.mod?.name || 'Unknown Mod';
      const fileId = String(mod.fileId);

      if (this.progressBar.status === CollectionProgressBar.STATUS_STOPPED) {
        this.console.log('Download queue stopped by user.', 'INFO');
        break;
      }

      if (downloadedHistory.includes(fileId)) {
        this.console.log(`[${modNumber}] Already downloaded: ${modName}`);
        this.progressBar.incrementProgress();
        continue;
      }

      if (this.progressBar.skipTo) {
        if (this.progressBar.skipToIndex - 1 > index) {
          this.console.log(`[${modNumber}] Skipping: ${modName}`);
          this.progressBar.incrementProgress();
          continue;
        }
        this.progressBar.skipTo = false;
      }

      const { downloadUrl, error } = await this.fetchDownloadUrl(mod);
      if (!downloadUrl) {
        this.console.log(`[${modNumber}] Error resolving ${modName}: ${error}`, 'ERROR');
        failedDownloads.push(mod);
      } else {
        if (downloadUrl.startsWith('nxm://')) {
          this.console.log(`[${modNumber}] Sent to Mod Manager: ${modName} (${convertSize(mod.file?.size)})`);
          triggerDownloadViaIframe(downloadUrl);
        } else {
          this.console.log(`[${modNumber}] Downloading: ${modName} (${convertSize(mod.file?.size)})`);
          const res = await sendMessage(MESSAGE_TYPES.START_DOWNLOAD, { url: downloadUrl });
          if (!res?.success) {
            triggerDownloadViaIframe(downloadUrl);
          }
        }
        await this.updateHistory(type, fileId);
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
          const timer = setInterval(() => {
            if (
              this.progressBar.skipPause ||
              this.progressBar.status === CollectionProgressBar.STATUS_STOPPED
            ) {
              this.progressBar.skipPause = false;
              clearInterval(timer);
              return resolve();
            }
            if (this.progressBar.status === CollectionProgressBar.STATUS_PAUSED) {
              return;
            }
            remaining--;
            if (remaining <= 0) {
              clearInterval(timer);
              return resolve();
            }
          }, 1000);
        });
      }
    }

    if (failedDownloads.length > 0) {
      this.console.log(`Failed to resolve ${failedDownloads.length} mod downloads.`, 'ERROR');
    }
    this.endDownload();
  }

  startDownload(count) {
    this.progressBar.setModsCount(count);
    this.progressBar.setProgress(0);
    this.progressBar.setStatus(CollectionProgressBar.STATUS_DOWNLOADING);
    this.downloadButton.element.style.display = 'none';
    this.progressBar.element.style.display = 'block';
    this.console.log('Collection download started.', 'INFO');
  }

  endDownload() {
    this.progressBar.setStatus(CollectionProgressBar.STATUS_FINISHED);
    this.progressBar.element.style.display = 'none';
    this.downloadButton.element.style.display = 'flex';
    this.console.log('Collection download completed.', 'INFO');
  }
}

class CollectionDownloadButton {
  constructor(manager) {
    this.manager = manager;
    this.element = document.createElement('div');
    this.element.className = 'nxdt-download-controls flex flex-col gap-3 w-full';
  }

  render() {
    const isVortex = this.manager.downloadMethod === DOWNLOAD_METHOD_VORTEX;
    this.element.innerHTML = `
      <div class="flex flex-col sm:flex-row gap-3 justify-between items-center">
        <div class="flex gap-4 items-center text-sm font-montserrat text-white">
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="nxdtMethod" value="${DOWNLOAD_METHOD_VORTEX}" ${isVortex ? 'checked' : ''} />
            <span>Send mods to Vortex / MO2</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="nxdtMethod" value="${DOWNLOAD_METHOD_BROWSER}" ${!isVortex ? 'checked' : ''} />
            <span>Browser Direct Download</span>
          </label>
        </div>
      </div>
      <div class="flex gap-2 w-full">
        <button id="nxdtDownloadAll" class="flex-1 font-montserrat font-semibold text-sm uppercase px-4 py-2 bg-primary-moderate hover:bg-primary-subdued text-white rounded flex justify-between items-center cursor-pointer">
          <span>Download All Mods</span>
          <span class="bg-surface-low px-2 py-0.5 rounded text-xs">${this.manager.mods.all.length} mods</span>
        </button>
        <button id="nxdtDownloadMandatory" class="font-montserrat font-semibold text-sm uppercase px-3 py-2 bg-surface-mid hover:bg-surface-high border border-neutral-moderate text-white rounded cursor-pointer" title="Download Mandatory Mods Only">
          Mandatory (${this.manager.mods.mandatory.length})
        </button>
        <button id="nxdtSelectMods" class="font-montserrat font-semibold text-sm uppercase px-3 py-2 bg-surface-mid hover:bg-surface-high border border-neutral-moderate text-white rounded cursor-pointer">
          Select Mods
        </button>
        <button id="nxdtUpdateCollection" class="font-montserrat font-semibold text-sm uppercase px-3 py-2 bg-surface-mid hover:bg-surface-high border border-neutral-moderate text-white rounded cursor-pointer">
          Update Diff
        </button>
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
}

class CollectionProgressBar {
  static STATUS_DOWNLOADING = 0;
  static STATUS_PAUSED = 1;
  static STATUS_FINISHED = 2;
  static STATUS_STOPPED = 3;

  constructor(manager) {
    this.manager = manager;
    this.modsCount = 0;
    this.progress = 0;
    this.skipPause = false;
    this.skipTo = false;
    this.skipToIndex = 0;
    this.status = CollectionProgressBar.STATUS_DOWNLOADING;
    this.element = document.createElement('div');
    this.element.className = 'nxdt-progress-container w-full space-y-2';
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
      <div class="relative w-full h-8 bg-surface-mid rounded overflow-hidden flex items-center">
        <div id="nxdtProgressFill" class="absolute top-0 left-0 h-full bg-primary-moderate transition-all duration-300" style="width: 0%"></div>
        <div class="relative z-10 w-full flex justify-between px-4 text-xs font-montserrat font-semibold text-white uppercase">
          <span id="nxdtPercent">0%</span>
          <span id="nxdtStatusText">Downloading...</span>
          <span id="nxdtCount">0/0</span>
        </div>
      </div>
      <div class="flex gap-2 justify-between items-center text-xs text-white">
        <div class="flex gap-2">
          <button id="nxdtPlayPause" class="px-3 py-1 bg-surface-high rounded cursor-pointer">Pause</button>
          <button id="nxdtStop" class="px-3 py-1 bg-red-600 rounded cursor-pointer">Stop</button>
        </div>
        <div class="flex gap-2">
          <button id="nxdtSkipPause" class="px-3 py-1 bg-surface-high rounded cursor-pointer">Skip Pause</button>
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
      this.setStatus(CollectionProgressBar.STATUS_STOPPED);
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
    this.element.className = 'nxdt-console-container w-full space-y-1 text-xs font-mono';
    this.element.innerHTML = `
      <div class="flex justify-between items-center text-neutral-moderate cursor-pointer" id="nxdtToggleLogs">
        <span>Activity Log</span>
        <span id="nxdtLogState">Hide</span>
      </div>
      <div id="nxdtLogOutput" class="bg-surface-low border border-stroke-subdued rounded p-2 h-28 overflow-y-auto space-y-0.5 text-gray-300"></div>
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
    if (type === 'ERROR') entry.className = 'text-red-400';
    else if (type === 'INFO') entry.className = 'text-sky-400';

    entry.textContent = `[${time}] ${message}`;
    this.output.appendChild(entry);
    this.output.scrollTop = this.output.scrollHeight;
  }
}

class CollectionSelectModal {
  constructor(manager) {
    this.manager = manager;
    this.element = document.createElement('div');
    this.element.className = 'nxdt-modal-overlay';
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

    const updateCount = () => {
      const checked = listContainer.querySelectorAll('input[type="checkbox"]:checked').length;
      countBadge.textContent = `${checked} selected`;
    };

    const renderList = (filter = '') => {
      listContainer.innerHTML = '';
      const filterLower = filter.toLowerCase();
      this.manager.mods.all.forEach((mod) => {
        const name = mod.file?.name || mod.file?.mod?.name || 'Unknown Mod';
        if (filterLower && !name.toLowerCase().includes(filterLower)) return;

        const row = document.createElement('label');
        row.className = 'nxdt-modal-row';
        row.innerHTML = `
          <div class="nxdt-modal-row-left">
            <input type="checkbox" data-file-id="${mod.fileId}" />
            <span class="nxdt-modal-row-title">${name}</span>
          </div>
          <div class="nxdt-modal-row-right">
            <span>${convertSize(mod.file?.size)}</span>
            <span class="${mod.optional ? 'nxdt-tag-optional' : 'nxdt-tag-mandatory'}">${mod.optional ? 'Optional' : 'Mandatory'}</span>
          </div>
        `;
        row.querySelector('input').addEventListener('change', updateCount);
        listContainer.appendChild(row);
      });
    };

    renderList();

    searchInput.addEventListener('input', (e) => renderList(e.target.value));

    this.element.querySelector('#nxdtSelAll').addEventListener('click', () => {
      listContainer.querySelectorAll('input[type="checkbox"]').forEach((cb) => (cb.checked = true));
      updateCount();
    });

    this.element.querySelector('#nxdtDeselAll').addEventListener('click', () => {
      listContainer.querySelectorAll('input[type="checkbox"]').forEach((cb) => (cb.checked = false));
      updateCount();
    });

    this.element.querySelector('#nxdtCloseSel').addEventListener('click', () => this.element.remove());

    this.element.querySelector('#nxdtStartSel').addEventListener('click', () => {
      const selectedIds = new Set();
      listContainer.querySelectorAll('input[type="checkbox"]:checked').forEach((cb) => {
        selectedIds.add(cb.getAttribute('data-file-id'));
      });
      const selectedMods = this.manager.mods.all.filter((m) => selectedIds.has(String(m.fileId)));
      this.element.remove();
      this.manager.downloadMods(selectedMods, 'selected');
    });
  }
}

class CollectionUpdateModal {
  constructor(manager) {
    this.manager = manager;
    this.element = document.createElement('div');
    this.element.className = 'nxdt-modal-overlay';
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

        diffOutput.innerHTML = `
          <div class="space-y-2">
            <div class="text-green-400 font-semibold">Added in Rev ${revB} (${added.length}):</div>
            <ul class="list-disc list-inside space-y-0.5 text-gray-300">
              ${added.map((m) => `<li>${m.file?.name || m.file?.mod?.name}</li>`).join('') || '<li>None</li>'}
            </ul>
            <div class="text-red-400 font-semibold mt-2">Removed in Rev ${revB} (${removed.length}):</div>
            <ul class="list-disc list-inside space-y-0.5 text-gray-300">
              ${removed.map((m) => `<li>${m.file?.name || m.file?.mod?.name}</li>`).join('') || '<li>None</li>'}
            </ul>
          </div>
        `;
      };

      selFrom.addEventListener('change', compare);
      selTo.addEventListener('change', compare);
    } catch (e) {
      log.warn('Failed to load revisions for diff', { error: e?.message });
    }
  }
}
