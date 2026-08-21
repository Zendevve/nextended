import {
  MESSAGE_TYPES,
  DOWNLOAD_METHOD_VORTEX,
  DOWNLOAD_METHOD_BROWSER,
} from '../shared/constants.js';
import { DEFAULT_SETTINGS } from '../storage/defaults.js';
import { createLogger } from '../shared/logger.js';
import { setNexusAdBypassCookie, isCloudflareChallenge, isAccountSuspended, isLoginRequired } from '../nexus/url-utils.js';

const log = createLogger('collection-ui');
const ICONS = {
  vortex: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`,
  browser: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`,
  download: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`,
  mandatory: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>`,
  select: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>`,
  diff: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>`,
  queue: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="8 17 12 21 16 17"></polyline><line x1="12" y1="12" x2="12" y2="21"></line><path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29"></path></svg>`,
  verify: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`,
  check: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
  play: `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`,
  pause: `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`,
  stop: `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"></rect></svg>`,
  skip: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19"></line></svg>`,
  terminal: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>`,
  cog: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`,
};

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
    setNexusAdBypassCookie();
    this.element.innerHTML = `
      <div class="nxdt-loading-btn">
        Fetching Collection Mods...
      </div>
    `;

    this.downloadMethod = DEFAULT_SETTINGS.collectionDownloadMethod ?? DOWNLOAD_METHOD_VORTEX;
    this.downloadSpeed = DEFAULT_SETTINGS.collectionDownloadSpeed ?? 1.5;
    this.pauseBetweenDownload = DEFAULT_SETTINGS.collectionPauseBetweenDownload ?? 1.5;

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
    const domain = mod.file?.mod?.game?.domainName || mod.gameDomain || this.gameDomain;
    const fileId = getModFileId(mod);
    const gameId = mod.file?.mod?.game?.id || mod.gameId || '0';
    const isNMM = downloadMethod === DOWNLOAD_METHOD_VORTEX;
    const modId = mod.file?.mod?.modId ?? mod.modId ?? mod.file?.modId;
    const uri = mod.file?.uri || mod.uri || '';

    if (!fileId) {
      return { downloadUrl: '', error: 'Missing fileId' };
    }

    try {
      const res = await sendMessage(MESSAGE_TYPES.RESOLVE_COLLECTION_DOWNLOAD, {
        fileId: String(fileId),
        gameId: String(gameId),
        gameDomain: domain,
        isNMM,
        modId,
        uri,
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
    setNexusAdBypassCookie();

    try {
      this.startDownload(modsList.length);
      const history = await this.getHistory();
      const downloadedHistory = history?.[this.gameDomain]?.[this.collectionSlug]?.[type] || [];
      const failedDownloads = [];
      let completedCount = 0;
      let skippedCount = 0;
      let forceStop = false;

      this.launchedDownloads = this.launchedDownloads || { count: 0, date: Date.now() };

      for (let index = 0; index < modsList.length; index++) {
        const mod = modsList[index];
        const modNumber = `${index + 1}/${modsList.length}`;
        const modName = mod.file?.name || mod.file?.mod?.name || 'Unknown Mod';
        const fileId = getModFileId(mod);

        if (this.aborted || runToken !== this.runToken) break;

        // Safety Rate Limiter: 200 downloads in 5 minutes
        if (this.launchedDownloads.date < Date.now() - 300000) {
          this.launchedDownloads.count = 0;
          this.launchedDownloads.date = Date.now();
        }

        if (this.launchedDownloads.count >= 200) {
          this.console.log(
            'Started 200 downloads in 5 minutes. Waiting 5 minutes safety pause before continuing to avoid temporary suspension...',
            'INFO'
          );
          let safetyRemaining = 300;
          await new Promise((resolve) => {
            const safetyTimer = setInterval(() => {
              safetyRemaining--;
              if (
                safetyRemaining <= 0 ||
                this.aborted ||
                runToken !== this.runToken ||
                this.progressBar.skipPause
              ) {
                this.progressBar.skipPause = false;
                clearInterval(safetyTimer);
                this.launchedDownloads.count = 0;
                this.launchedDownloads.date = Date.now();
                return resolve();
              }
            }, 1000);
          });
          if (this.aborted || runToken !== this.runToken) break;
        }

        if (downloadedHistory.includes(fileId)) {
          this.console.log(`[${modNumber}] Skipped (already downloaded): ${modName}`);
          this.progressBar.incrementProgress();
          skippedCount++;
          continue;
        }

        if (this.progressBar.skipTo) {
          if (this.progressBar.skipToIndex - 1 > index) {
            this.console.log(`[${modNumber}] Skipping: ${modName}`);
            this.progressBar.incrementProgress();
            if (this.progressBar.skipToIndex - 1 === index + 1) {
              this.progressBar.skipTo = false;
            }
            continue;
          }
          this.progressBar.skipTo = false;
        }

        this.progressBar.setCurrentMod(modName);

        const { downloadUrl, error } = await this.fetchDownloadUrl(mod, downloadMethod);
        if (this.aborted || runToken !== this.runToken) break;

        if (!downloadUrl) {
          this.console.log(`[${modNumber}] Error resolving ${modName}: ${error}`, 'ERROR');
          if (isLoginRequired(error)) {
            this.console.log(
              'You are not connected on NexusMods. Please login and try again.',
              'ERROR'
            );
            forceStop = true;
          } else if (isCloudflareChallenge(error)) {
            this.console.log(
              'You are rate limited by Cloudflare challenge. Please solve captcha in browser.',
              'ERROR'
            );
            forceStop = true;
          } else if (isAccountSuspended(error)) {
            this.console.log(
              'Nexus Mods temporarily suspended your account for 10 minutes due to request rate. Please wait.',
              'ERROR'
            );
            forceStop = true;
          } else {
            failedDownloads.push(mod);
          }
        } else if (downloadUrl.startsWith('nxm://')) {
          this.console.log(`[${modNumber}] Sent to Mod Manager: ${modName} (${convertSize(mod.file?.size)})`);
          triggerDownloadViaIframe(downloadUrl);
          await this.updateHistory(type, fileId);
          if (this.aborted || runToken !== this.runToken) break;
          this.progressBar.incrementProgress();
          completedCount++;
          this.launchedDownloads.count++;
          this.launchedDownloads.date = Date.now();
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
          this.launchedDownloads.count++;
          this.launchedDownloads.date = Date.now();
        }

        if (forceStop) {
          this.console.log('Download stopped due to authentication or Cloudflare error.', 'ERROR');
          break;
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
                this.progressBar.skipTo ||
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
      <div class="nxdt-controls-header">
        <div class="nxdt-segmented" role="radiogroup" aria-label="Download method">
          <label class="nxdt-seg-btn" title="Send downloads to Vortex or Mod Organizer 2 via NXM protocol">
            <input type="radio" name="nxdtMethod" value="${DOWNLOAD_METHOD_VORTEX}" ${isVortex ? 'checked' : ''} />
            ${ICONS.vortex}
            <span>Vortex / MO2</span>
          </label>
          <label class="nxdt-seg-btn" title="Download mod archives directly in browser">
            <input type="radio" name="nxdtMethod" value="${DOWNLOAD_METHOD_BROWSER}" ${!isVortex ? 'checked' : ''} />
            ${ICONS.browser}
            <span>Browser Direct</span>
          </label>
        </div>
        <div class="nxdt-queue-row">
          <button id="nxdtVerifyDownloads" class="nxdt-btn-util nxdt-btn-util-blue" title="Scan downloads and check for missing files">
            ${ICONS.verify}
            <span>Verify</span>
          </button>
        </div>
      </div>
      </div>
      <button id="nxdtDownloadAll" class="nxdt-btn-hero" title="Download All Mods">
        <div class="nxdt-btn-hero-left">
          ${ICONS.download}
          <span>Download All Mods</span>
        </div>
        <span class="nxdt-btn-hero-badge">${totalCount} mods</span>
      </button>
      <div class="nxdt-secondary-row">
        <button id="nxdtDownloadMandatory" class="nxdt-btn-secondary" title="Download Mandatory Mods Only">
          ${ICONS.mandatory}
          <span>Mandatory (${mandatoryCount})</span>
        </button>
        <button id="nxdtSelectMods" class="nxdt-btn-secondary" title="Select specific mods to download">
          ${ICONS.select}
          <span>Select Mods</span>
        </button>
        <button id="nxdtUpdateCollection" class="nxdt-btn-secondary" title="Compare collection revisions">
          ${ICONS.diff}
          <span>Update Diff</span>
        </button>
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
          <span style="font-weight:600;" id="nxdtFailedCountTitle"></span>
          <div style="display:flex;gap:6px;align-items:center;">
            <button type="button" id="nxdtOpenFailedExternal" class="nxdt-btn-sm" style="background:#292e36;color:#58a6ff;border:1px solid #444c56;cursor:pointer;" title="Open pages for failed items">Open External Links</button>
            <button type="button" id="nxdtRetryFailed" class="nxdt-btn-sm" style="background:#da8e35;color:#fff;border:none;cursor:pointer;font-weight:600;"></button>
          </div>
        </div>
        <div id="nxdtFailedItemsList" class="nxdt-failed-list" style="font-size:11px;color:#f85149;max-height:80px;overflow-y:auto;background:rgba(0,0,0,0.25);padding:6px 8px;border-radius:4px;display:flex;flex-direction:column;gap:2px;"></div>
      `;

      const countTitle = summaryEl.querySelector('#nxdtFailedCountTitle');
      if (countTitle) countTitle.textContent = `${failed.length} mod download(s) failed`;
      const retryBtn = summaryEl.querySelector('#nxdtRetryFailed');
      if (retryBtn) retryBtn.textContent = `Retry Failed (${failed.length})`;

      const listEl = summaryEl.querySelector('#nxdtFailedItemsList');
      if (listEl) {
        failed.forEach((m) => {
          const itemEl = document.createElement('div');
          itemEl.textContent = `• ${m.file?.name || m.file?.mod?.name || 'Unknown Mod'}`;
          listEl.appendChild(itemEl);
        });
      }
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
      summaryEl.textContent = `Completed: ${completed} downloaded, ${skipped} skipped`;
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
    this.skipTo = false;
    this.skipToIndex = 0;
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
      </div>
      <div class="nxdt-progress-subline">
        <span id="nxdtCurrentMod"></span>
        <span id="nxdtProgressEta"></span>
      </div>
      <div class="nxdt-progress-actions">
        <div class="nxdt-progress-actions-group">
          <button id="nxdtPlayPause" class="nxdt-progress-btn">
            ${ICONS.pause}
            <span>Pause</span>
          </button>
          <button id="nxdtStop" class="nxdt-progress-btn nxdt-progress-btn-danger">
            ${ICONS.stop}
            <span>Stop</span>
          </button>
        </div>
        <div class="nxdt-progress-actions-group">
          <button id="nxdtSkipPause" class="nxdt-progress-btn">
            ${ICONS.skip}
            <span>Skip Wait</span>
          </button>
          <div class="nxdt-skip-to-wrap" style="display:inline-flex;align-items:center;gap:4px;">
            <input type="number" id="nxdtSkipToIndexInput" min="1" placeholder="Index" class="nxdt-input-number" style="width:58px;padding:2px 6px;border-radius:4px;border:1px solid #444c56;background:#22272e;color:#e6edf3;font-size:11px;" />
            <button id="nxdtSkipToIndexBtn" class="nxdt-progress-btn" style="padding:2px 8px;font-size:11px;">
              <span>Skip to #</span>
            </button>
          </div>
        </div>
      </div>
      <div class="nxdt-progress-throttle" style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.06);font-size:11px;color:#8b949e;">
        <div style="display:inline-flex;align-items:center;gap:6px;">
          <label for="nxdtDlSpeedInput">Speed (MB/s):</label>
          <input type="number" id="nxdtDlSpeedInput" min="0.1" step="0.5" value="${this.manager.downloadSpeed}" style="width:52px;padding:2px 4px;border-radius:3px;border:1px solid #444c56;background:#22272e;color:#e6edf3;font-size:11px;" />
        </div>
        <div style="display:inline-flex;align-items:center;gap:6px;">
          <label for="nxdtExtraPauseInput">Extra pause (s):</label>
          <input type="number" id="nxdtExtraPauseInput" min="0" step="1" value="${this.manager.pauseBetweenDownload}" style="width:48px;padding:2px 4px;border-radius:3px;border:1px solid #444c56;background:#22272e;color:#e6edf3;font-size:11px;" />
        </div>
      </div>
    `;

    this.element.querySelector('#nxdtPlayPause').addEventListener('click', (e) => {
      const btn = e.currentTarget;
      if (this.status === CollectionProgressBar.STATUS_DOWNLOADING) {
        this.setStatus(CollectionProgressBar.STATUS_PAUSED);
        btn.innerHTML = `${ICONS.play} <span>Resume</span>`;
      } else {
        this.setStatus(CollectionProgressBar.STATUS_DOWNLOADING);
        btn.innerHTML = `${ICONS.pause} <span>Pause</span>`;
      }
    });

    this.element.querySelector('#nxdtStop').addEventListener('click', () => {
      this.manager.abort();
    });

    this.element.querySelector('#nxdtSkipPause').addEventListener('click', () => {
      this.skipPause = true;
    });

    const skipToIndexInput = this.element.querySelector('#nxdtSkipToIndexInput');
    this.element.querySelector('#nxdtSkipToIndexBtn')?.addEventListener('click', () => {
      const target = parseInt(skipToIndexInput.value, 10);
      if (target > this.progress && target <= this.modsCount) {
        this.skipTo = true;
        this.skipToIndex = target;
        this.setStatus(CollectionProgressBar.STATUS_DOWNLOADING);
      }
    });

    const speedInput = this.element.querySelector('#nxdtDlSpeedInput');
    speedInput?.addEventListener('change', (e) => {
      const val = parseFloat(e.target.value);
      if (Number.isFinite(val) && val > 0) {
        this.manager.downloadSpeed = val;
      }
    });

    const pauseInput = this.element.querySelector('#nxdtExtraPauseInput');
    pauseInput?.addEventListener('change', (e) => {
      const val = parseFloat(e.target.value);
      if (Number.isFinite(val) && val >= 0) {
        this.manager.pauseBetweenDownload = val;
      }
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
      <div class="nxdt-log-toggle" id="nxdtToggleLogs" title="Toggle activity log console">
        <div class="nxdt-log-toggle-left">
          ${ICONS.terminal}
          <span>Activity Log</span>
        </div>
        <span id="nxdtLogState" class="nxdt-log-state-badge">Show</span>
      </div>
      <div id="nxdtLogOutput" class="nxdt-log-box" style="display:none;"></div>
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
    this.lastCheckedIndex = null;
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
        <div class="nxdt-modal-search-bar" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;">
          <input type="search" id="nxdtSearch" placeholder="Search mods..." style="flex:1;min-width:140px;" />
          <select id="nxdtSort" class="nxdt-select-rev" style="max-width:180px;">
            <option value="mod_name_asc">Mod name (A-Z)</option>
            <option value="mod_name_desc">Mod name (Z-A)</option>
            <option value="file_name_asc">File name (A-Z)</option>
            <option value="file_name_desc">File name (Z-A)</option>
            <option value="size_asc">Size (Smallest)</option>
            <option value="size_desc">Size (Largest)</option>
          </select>
          <button id="nxdtSelAll" class="nxdt-btn-sm">Select All</button>
          <button id="nxdtSelMandatory" class="nxdt-btn-sm">Mandatory</button>
          <button id="nxdtInvertSel" class="nxdt-btn-sm">Invert</button>
          <button id="nxdtDeselAll" class="nxdt-btn-sm">Clear</button>
        </div>
        <div class="nxdt-modal-tools" style="display:flex;gap:6px;margin:4px 0 8px 0;font-size:11px;">
          <button id="nxdtExportJson" class="nxdt-btn-sm" style="padding:2px 8px;">Export Selection (.json)</button>
          <button id="nxdtImportJson" class="nxdt-btn-sm" style="padding:2px 8px;">Import Selection (.json)</button>
          <button id="nxdtImportDownloaded" class="nxdt-btn-sm" style="padding:2px 8px;">Scan Downloaded Folder</button>
          <input type="file" id="nxdtJsonFileInput" accept=".json" style="display:none;" />
          <input type="file" id="nxdtFolderFileInput" multiple style="display:none;" />
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
    const sortSelect = this.element.querySelector('#nxdtSort');
    const countBadge = this.element.querySelector('#nxdtSelCount');

    const checkedIds = new Set();

    const updateCount = () => {
      countBadge.textContent = `${checkedIds.size} selected`;
    };

    const getSortedMods = () => {
      const mods = [...this.manager.mods.all];
      const sort = sortSelect?.value || 'mod_name_asc';
      switch (sort) {
        case 'mod_name_asc':
          mods.sort((a, b) => (a.file?.mod?.name || '').localeCompare(b.file?.mod?.name || ''));
          break;
        case 'mod_name_desc':
          mods.sort((a, b) => (b.file?.mod?.name || '').localeCompare(a.file?.mod?.name || ''));
          break;
        case 'file_name_asc':
          mods.sort((a, b) => (a.file?.name || '').localeCompare(b.file?.name || ''));
          break;
        case 'file_name_desc':
          mods.sort((a, b) => (b.file?.name || '').localeCompare(a.file?.name || ''));
          break;
        case 'size_asc':
          mods.sort((a, b) => (a.file?.size || 0) - (b.file?.size || 0));
          break;
        case 'size_desc':
          mods.sort((a, b) => (b.file?.size || 0) - (a.file?.size || 0));
          break;
      }
      return mods;
    };

    const renderList = (filter = '') => {
      listContainer.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        if (cb.checked) checkedIds.add(cb.getAttribute('data-file-id'));
        else checkedIds.delete(cb.getAttribute('data-file-id'));
      });

      listContainer.innerHTML = '';
      const filterLower = filter.toLowerCase();
      const sortedMods = getSortedMods();
      sortedMods.forEach((mod, rowIndex) => {
        const fileId = getModFileId(mod);
        const name = mod.file?.name || mod.file?.mod?.name || 'Unknown Mod';
        if (filterLower && !name.toLowerCase().includes(filterLower)) {
          return;
        }

        const row = document.createElement('label');
        row.className = 'nxdt-modal-row';
        row.setAttribute('data-row-index', String(rowIndex));

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
          if (checkbox.checked) checkedIds.add(fileId);
          else checkedIds.delete(fileId);
          updateCount();
        });

        row.addEventListener('click', (e) => {
          if (e.target !== checkbox) {
            checkbox.checked = !checkbox.checked;
            if (checkbox.checked) checkedIds.add(fileId);
            else checkedIds.delete(fileId);
          }

          if (e.shiftKey && this.lastCheckedIndex !== null) {
            const allCheckboxes = Array.from(listContainer.querySelectorAll('input[type="checkbox"]'));
            const currentIdx = allCheckboxes.indexOf(checkbox);
            const start = Math.min(this.lastCheckedIndex, currentIdx);
            const end = Math.max(this.lastCheckedIndex, currentIdx);
            const targetState = checkbox.checked;

            for (let i = start; i <= end; i++) {
              const cb = allCheckboxes[i];
              if (cb) {
                cb.checked = targetState;
                const fid = cb.getAttribute('data-file-id');
                if (targetState) checkedIds.add(fid);
                else checkedIds.delete(fid);
              }
            }
          }
          this.lastCheckedIndex = Array.from(listContainer.querySelectorAll('input[type="checkbox"]')).indexOf(checkbox);
          updateCount();
        });

        listContainer.appendChild(row);
      });

      updateCount();
    };

    renderList();

    searchInput.addEventListener('input', (e) => renderList(e.target.value));
    sortSelect.addEventListener('change', () => renderList(searchInput.value));

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
        if (!mod.optional) checkedIds.add(fileId);
        else checkedIds.delete(fileId);
      });
      listContainer.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        const fileId = cb.getAttribute('data-file-id');
        cb.checked = checkedIds.has(fileId);
      });
      updateCount();
    });

    this.element.querySelector('#nxdtInvertSel')?.addEventListener('click', () => {
      listContainer.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        const fileId = cb.getAttribute('data-file-id');
        cb.checked = !cb.checked;
        if (cb.checked) checkedIds.add(fileId);
        else checkedIds.delete(fileId);
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

    // Export JSON
    this.element.querySelector('#nxdtExportJson')?.addEventListener('click', () => {
      const selectedMods = this.manager.mods.all.filter((m) => checkedIds.has(getModFileId(m)));
      if (!selectedMods.length) {
        alert('Please select at least one mod to export.');
        return;
      }
      const blob = new Blob([JSON.stringify(selectedMods, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ndc_selected_mods_${this.manager.gameDomain}_${this.manager.collectionSlug}_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    // Import JSON
    const jsonFileInput = this.element.querySelector('#nxdtJsonFileInput');
    this.element.querySelector('#nxdtImportJson')?.addEventListener('click', () => {
      jsonFileInput?.click();
    });
    jsonFileInput?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const imported = JSON.parse(text);
        if (Array.isArray(imported)) {
          imported.forEach((m) => {
            const fid = getModFileId(m);
            if (fid) checkedIds.add(fid);
          });
          renderList(searchInput.value);
        }
      } catch (err) {
        log.warn('Failed to parse selection JSON', err);
      }
    });

    // Scan Downloaded Folder
    const folderFileInput = this.element.querySelector('#nxdtFolderFileInput');
    this.element.querySelector('#nxdtImportDownloaded')?.addEventListener('click', () => {
      folderFileInput?.click();
    });
    folderFileInput?.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      if (!files.length) return;

      const downloadedFileIds = new Set();
      this.manager.mods.all.forEach((mod) => {
        const uri = mod.file?.uri || '';
        const name = mod.file?.name || '';
        const modId = String(mod.file?.mod?.modId || '');
        const isFound = files.some((f) => {
          if (uri && f.name.includes(uri)) return true;
          if (name && modId && f.name.includes(modId) && f.name.includes(name)) return true;
          return false;
        });
        if (isFound) {
          downloadedFileIds.add(getModFileId(mod));
        }
      });

      // Select ONLY un-downloaded mods
      this.manager.mods.all.forEach((mod) => {
        const fid = getModFileId(mod);
        if (!downloadedFileIds.has(fid)) {
          checkedIds.add(fid);
        } else {
          checkedIds.delete(fid);
        }
      });
      renderList(searchInput.value);
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
    this.modsToDownload = [];
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
      <div class="nxdt-modal-box" style="max-width:850px;width:95%;">
        <div class="nxdt-modal-header">
          <h3>Update Collection Revisions</h3>
        </div>
        <div class="nxdt-modal-search-bar" style="display:flex;gap:10px;">
          <div style="flex:1;">
            <label style="display:block;font-size:11px;color:#8b949e;margin-bottom:4px;">Current Revision</label>
            <select id="nxdtRevFrom" class="nxdt-select-rev" style="width:100%;"></select>
          </div>
          <div style="flex:1;">
            <label style="display:block;font-size:11px;color:#8b949e;margin-bottom:4px;">Target Revision to Update To</label>
            <select id="nxdtRevTo" class="nxdt-select-rev" style="width:100%;"></select>
          </div>
        </div>
        <div id="nxdtDiffOutput" class="nxdt-modal-list nxdt-diff-output" style="max-height:420px;overflow-y:auto;">
          Select revisions above to compare differences.
        </div>
        <div class="nxdt-modal-footer">
          <button id="nxdtCloseDiff" class="nxdt-btn-sm">Cancel</button>
          <button id="nxdtUpdateBtn" class="nxdt-btn-primary" style="display:none;">Update Collection</button>
        </div>
      </div>
    `;

    const updateBtn = this.element.querySelector('#nxdtUpdateBtn');
    this.element.querySelector('#nxdtCloseDiff').addEventListener('click', () => this.close());
    updateBtn?.addEventListener('click', () => {
      if (this.modsToDownload.length > 0) {
        this.close();
        this.manager.downloadMods(this.modsToDownload, 'update');
      }
    });

    try {
      const res = await sendMessage(MESSAGE_TYPES.FETCH_COLLECTION_REVISIONS, {
        gameDomain: this.manager.gameDomain,
        collectionSlug: this.manager.collectionSlug,
      });
      const revisions = res?.revisions || [];
      const selFrom = this.element.querySelector('#nxdtRevFrom');
      const selTo = this.element.querySelector('#nxdtRevTo');

      selFrom.innerHTML = `<option value="">Select current revision</option>`;
      selTo.innerHTML = `<option value="">Select revision to update to</option>`;

      revisions.forEach((r) => {
        const opt = document.createElement('option');
        opt.value = r.revisionNumber;
        opt.textContent = `Revision ${r.revisionNumber} (${(r.totalSize / (1024 * 1024)).toFixed(1)} MB) - ${new Date(r.createdAt || Date.now()).toLocaleDateString()}`;
        selFrom.appendChild(opt.cloneNode(true));
        selTo.appendChild(opt);
      });

      const compare = async () => {
        const revA = parseInt(selFrom.value, 10);
        const revB = parseInt(selTo.value, 10);
        if (!revA || !revB) {
          updateBtn.style.display = 'none';
          return;
        }

        const diffOutput = this.element.querySelector('#nxdtDiffOutput');
        diffOutput.innerHTML = '<div style="padding:16px;text-align:center;color:#8b949e;">Comparing revisions...</div>';

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

        // Group current and new by modId or fileId
        const currentByModId = {};
        modsA.forEach((m) => {
          const mid = String(m.file?.mod?.modId || m.modId || m.fileId || m.file?.fileId || '');
          if (mid) {
            currentByModId[mid] = currentByModId[mid] || [];
            currentByModId[mid].push(m);
          }
        });

        const newByModId = {};
        modsB.forEach((m) => {
          const mid = String(m.file?.mod?.modId || m.modId || m.fileId || m.file?.fileId || '');
          if (mid) {
            newByModId[mid] = newByModId[mid] || [];
            newByModId[mid].push(m);
          }
        });

        const addedMods = [];
        const updatedMods = [];
        const removedMods = [];

        for (const [mid, newFiles] of Object.entries(newByModId)) {
          const currentFiles = currentByModId[mid] || [];
          newFiles.forEach((newFile) => {
            const match = currentFiles.find(
              (cf) => cf.fileId === newFile.fileId || cf.file?.name === newFile.file?.name
            );
            if (!match) {
              addedMods.push(newFile);
            } else if (match.file?.version !== newFile.file?.version) {
              updatedMods.push(newFile);
            }
          });

          const remaining = currentFiles.filter(
            (cf) => !newFiles.some((nf) => nf.fileId === cf.fileId || nf.file?.name === cf.file?.name)
          );
          removedMods.push(...remaining);
        }

        for (const [mid, currentFiles] of Object.entries(currentByModId)) {
          if (!newByModId[mid]) {
            currentFiles.forEach((cf) => {
              if (!removedMods.includes(cf)) removedMods.push(cf);
            });
          }
        }

        this.modsToDownload = [...addedMods, ...updatedMods];
        const nameOf = (m) => m.file?.name || m.file?.mod?.name || 'Unknown Mod';

        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:12px;';

        const createCol = (title, color, items) => {
          const col = document.createElement('div');
          const h = document.createElement('div');
          h.style.cssText = `font-weight:600;color:${color};font-size:13px;margin-bottom:6px;`;
          h.textContent = `${title} (${items.length})`;
          col.appendChild(h);

          const list = document.createElement('div');
          list.className = 'nxdt-diff-col-list';
          list.style.cssText = 'font-size:12px;color:#e6edf3;display:flex;flex-direction:column;gap:4px;';
          if (items.length === 0) {
            const empty = document.createElement('div');
            empty.style.color = '#8b949e';
            empty.textContent = 'None';
            list.appendChild(empty);
          } else {
            items.forEach((m) => {
              const row = document.createElement('div');
              row.textContent = `• ${nameOf(m)}`;
              list.appendChild(row);
            });
          }
          col.appendChild(list);
          return col;
        };

        wrap.appendChild(createCol('Updated Mods', '#3fb950', updatedMods));
        wrap.appendChild(createCol('Added Mods', '#58a6ff', addedMods));
        wrap.appendChild(createCol('Removed Mods', '#f85149', removedMods));

        diffOutput.innerHTML = '';
        diffOutput.appendChild(wrap);

        if (this.modsToDownload.length > 0) {
          updateBtn.style.display = 'inline-flex';
          updateBtn.textContent = `Update (${this.modsToDownload.length} mods)`;
        } else {
          updateBtn.style.display = 'none';
        }
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
            <span class="nxdt-modal-icon" style="display:flex;align-items:center;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg></span>
            <h3>Download Verification & Integrity Scanner</h3>
          </div>
          <button id="nxdtCloseVerifHeader" class="nxdt-btn-icon">&times;</button>
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
            ${confirmed === total ? 'Collection 100% Downloaded!' : 'Verification Scan Complete'}
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
            ? `<button id="nxdtDownloadMissing" class="nxdt-btn-primary" style="background:#da8e35;color:#fff;">Download Missing Only (${missing})</button>`
            : `<button id="nxdtCloseVerif2" class="nxdt-btn-primary" style="background:#3fb950;color:#fff;">Everything Downloaded</button>`
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

        const statusPill = document.createElement('span');
        statusPill.className = `nxdt-pill-tag ${item.confirmed ? 'nxdt-pill-nexus' : 'nxdt-pill-offsite'}`;
        statusPill.textContent = item.confirmed ? 'OK' : 'FAIL';

        const textGroup = document.createElement('div');
        const titleEl = document.createElement('div');
        titleEl.className = 'nxdt-modal-row-title';
        titleEl.textContent = item.modName;
        const subEl = document.createElement('div');
        subEl.style.cssText = 'font-size:11px;color:#8b949e;';
        subEl.textContent = `${item.fileName} • ${convertSize(item.fileSize)}`;

        textGroup.appendChild(titleEl);
        textGroup.appendChild(subEl);
        left.appendChild(statusPill);
        left.appendChild(textGroup);

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

