import {
  MESSAGE_TYPES,
  STORAGE_KEY_QUEUE,
  QUEUE_STATUS,
  ITEM_STATUS,
} from '../shared/constants.js';
import { createLogger } from '../shared/logger.js';
import { showToast } from './toast.js';

const log = createLogger('floating-drawer');

function formatBytes(bytes) {
  if (!bytes || isNaN(bytes) || bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(2)} GB`;
  }
  return `${mb.toFixed(1)} MB`;
}

function formatSpeed(bytesPerSec) {
  if (!bytesPerSec || bytesPerSec <= 0) return '';
  const mbps = (bytesPerSec / (1024 * 1024)).toFixed(1);
  return `• ${mbps} MB/s`;
}

export class FloatingDrawer {
  constructor() {
    this.isOpen = false;
    this.state = {
      status: QUEUE_STATUS.IDLE,
      items: [],
      counts: { total: 0, completed: 0, failed: 0, active: 0, pending: 0 },
      totalBytes: 0,
      downloadedBytes: 0,
      currentSpeedBytesPerSec: 0,
    };
    this.container = null;
    this.drawer = null;
    this.dock = null;
    this._handleKeydown = (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    };
  }

  init() {
    if (document.getElementById('nxdt-floating-root')) return;

    this.container = document.createElement('div');
    this.container.id = 'nxdt-floating-root';
    this.container.className = 'nxdt-floating-root';

    document.body.appendChild(this.container);

    this.render();
    this.loadState();
    this.listenForUpdates();
  }

  async loadState() {
    try {
      const stored = await chrome?.storage?.local?.get(STORAGE_KEY_QUEUE);
      if (stored?.[STORAGE_KEY_QUEUE]) {
        this.updateState(stored[STORAGE_KEY_QUEUE]);
      }
    } catch {
      /* ignore */
    }
  }

  listenForUpdates() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes[STORAGE_KEY_QUEUE]) {
          this.updateState(changes[STORAGE_KEY_QUEUE].newValue);
        }
      });
    }
  }

  updateState(newState) {
    if (!newState) return;
    this.state = { ...this.state, ...newState };
    this.render();
  }

  async sendQueueMessage(type, payload = {}) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type, payload }, (res) => {
          if (chrome.runtime.lastError) {
            log.warn('Queue message failed', { type, error: chrome.runtime.lastError.message });
            resolve(null);
          } else {
            resolve(res);
          }
        });
      } catch (e) {
        log.warn('Queue message send exception', { type, error: e?.message });
        resolve(null);
      }
    });
  }

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    document.addEventListener('keydown', this._handleKeydown);
    this.render();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    document.removeEventListener('keydown', this._handleKeydown);
    this.render();
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  render() {
    if (!this.container) return;

    const { status, items = [], counts = {}, totalBytes = 0, downloadedBytes = 0 } = this.state;
    const total = counts.total || items.length;
    const completed = counts.completed || items.filter((i) => i.status === ITEM_STATUS.COMPLETED).length;
    const active = counts.active || items.filter((i) => i.status === ITEM_STATUS.DOWNLOADING || i.status === ITEM_STATUS.RESOLVING).length;
    const failed = counts.failed || items.filter((i) => i.status === ITEM_STATUS.FAILED).length;

    // Only hide dock if 0 items and idle
    if (total === 0 && status === QUEUE_STATUS.IDLE && !this.isOpen) {
      this.container.innerHTML = '';
      return;
    }

    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    const statusText =
      status === QUEUE_STATUS.RUNNING
        ? `Downloading (${active} active)`
        : status === QUEUE_STATUS.PAUSED
          ? 'Paused'
          : status === QUEUE_STATUS.COMPLETED
            ? 'Completed'
            : status === QUEUE_STATUS.FAILED
              ? 'Attention Needed'
              : 'Idle';

    const statusClass =
      status === QUEUE_STATUS.RUNNING
        ? 'nxdt-status-running'
        : status === QUEUE_STATUS.PAUSED
          ? 'nxdt-status-paused'
          : status === QUEUE_STATUS.COMPLETED
            ? 'nxdt-status-completed'
            : status === QUEUE_STATUS.FAILED
              ? 'nxdt-status-failed'
              : 'nxdt-status-idle';

    let html = `
      <div class="nxdt-dock-pill ${this.isOpen ? 'nxdt-hidden' : ''}" id="nxdt-dock-btn" title="Open Download Queue Drawer (Esc to close)">
        <span class="nxdt-dock-dot ${statusClass} ${status === QUEUE_STATUS.RUNNING ? 'nxdt-pulse-dot' : ''}"></span>
        <span class="nxdt-dock-label">Queue: <b>${completed}/${total}</b> (${pct}%)</span>
        ${active > 0 ? `<span class="nxdt-badge" style="background:#3fb950;color:#fff;font-size:10px;padding:2px 6px;border-radius:10px;">${active} active</span>` : ''}
        ${failed > 0 ? `<span class="nxdt-badge" style="background:#f85149;color:#fff;font-size:10px;padding:2px 6px;border-radius:10px;">${failed} failed</span>` : ''}
        ${status === QUEUE_STATUS.RUNNING ? `<span class="nxdt-dock-spinner"></span>` : ''}
      </div>
    `;

    if (this.isOpen) {
      html += `
        <div class="nxdt-drawer-panel" id="nxdt-drawer-panel">
          <div class="nxdt-drawer-header">
            <div class="nxdt-header-title">
              <span class="nxdt-title-icon">⚡</span>
              <h3>Nexus Download Queue</h3>
              <span class="nxdt-header-badge ${statusClass}">${statusText}</span>
            </div>
            <button class="nxdt-btn-icon" id="nxdt-drawer-close" title="Close Drawer (Esc)">✕</button>
          </div>

          <div class="nxdt-drawer-progress">
            <div class="nxdt-progress-labels">
              <span><b>${completed}/${total}</b> mods processed</span>
              <span>${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)} ${formatSpeed(this.state.currentSpeedBytesPerSec)}</span>
            </div>
            <div class="nxdt-progress-bar-track">
              <div class="nxdt-progress-bar-fill" style="width: ${pct}%"></div>
            </div>
          </div>

          <div class="nxdt-drawer-toolbar">
            ${
              status === QUEUE_STATUS.RUNNING
                ? `<button class="nxdt-btn nxdt-btn-amber" id="nxdt-queue-pause">Pause All</button>`
                : `<button class="nxdt-btn nxdt-btn-green" id="nxdt-queue-resume">Resume All</button>`
            }
            ${
              failed > 0
                ? `<button class="nxdt-btn nxdt-btn-amber" id="nxdt-queue-retry">Retry Failed (${failed})</button>`
                : ''
            }
            <button class="nxdt-btn nxdt-btn-dark" id="nxdt-queue-clear">Clear Finished</button>
            <button class="nxdt-btn nxdt-btn-dark" id="nxdt-queue-export" title="Export download list">Export</button>
          </div>
          <div class="nxdt-drawer-items">
            ${
              items.length === 0
                ? `<div class="nxdt-empty-queue">Queue is empty. Click download on collections, mods, or requirements to queue!</div>`
                : items
                    .slice(0, 100)
                    .map((item) => {
                      const isDone = item.status === ITEM_STATUS.COMPLETED;
                      const isFail = item.status === ITEM_STATUS.FAILED;
                      const isAct =
                        item.status === ITEM_STATUS.DOWNLOADING || item.status === ITEM_STATUS.RESOLVING;
                      const isExt = item.status === ITEM_STATUS.EXTERNAL;
                      const itemBadge = isDone
                        ? '✅ Done'
                        : isFail
                          ? '❌ Failed'
                          : isAct
                            ? '⏳ Active'
                            : isExt
                              ? '🔗 External'
                              : '🕒 Pending';
                      const itemClass = isDone
                        ? 'nxdt-item-done'
                        : isFail
                          ? 'nxdt-item-failed'
                          : isAct
                            ? 'nxdt-item-active'
                            : 'nxdt-item-pending';

                      return `
                        <div class="nxdt-queue-item ${itemClass}">
                          <div class="nxdt-item-info">
                            <div class="nxdt-item-name" title="${item.modName}">${item.modName}</div>
                            <div class="nxdt-item-sub">
                              <span>${item.fileName || 'Archive'}</span>
                              ${item.fileSize ? `<span>• ${formatBytes(item.fileSize)}</span>` : ''}
                              ${item.isNMM ? `<span class="nxdt-pill-tag">NXM</span>` : `<span class="nxdt-pill-tag">Direct</span>`}
                            </div>
                            ${item.error ? `<div class="nxdt-item-error">${item.error}</div>` : ''}
                            ${item.externalUrl ? `<a class="nxdt-item-link" href="${item.externalUrl}" target="_blank" rel="noopener">Open External Download ↗</a>` : ''}
                          </div>
                          <div class="nxdt-item-actions">
                            <span class="nxdt-item-status-tag ${itemClass}">${itemBadge}</span>
                            ${
                              item.status === ITEM_STATUS.PENDING || item.status === ITEM_STATUS.FAILED
                                ? `<button class="nxdt-btn-skip" data-item-id="${item.id}" title="Skip item">Skip</button>`
                                : ''
                            }
                          </div>
                        </div>
                      `;
                    })
                    .join('')
            }
          </div>
          <div class="nxdt-drawer-footer">
            <a class="nxdt-drawer-coffee-link" href="https://buymeacoffee.com/zendevve" target="_blank" rel="noopener noreferrer" title="Support development on Buy Me a Coffee">☕ Buy Me a Coffee</a>
          </div>
        </div>
      `;
    }

    this.container.innerHTML = html;
    this.attachEventListeners();
  }

  attachEventListeners() {
    const dockBtn = this.container.querySelector('#nxdt-dock-btn');
    if (dockBtn) {
      dockBtn.addEventListener('click', () => this.toggle());
    }

    const closeBtn = this.container.querySelector('#nxdt-drawer-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.toggle());
    }

    const pauseBtn = this.container.querySelector('#nxdt-queue-pause');
    if (pauseBtn) {
      pauseBtn.addEventListener('click', () => {
        this.sendQueueMessage(MESSAGE_TYPES.QUEUE_PAUSE);
        showToast('Queue paused', 'info');
      });
    }

    const resumeBtn = this.container.querySelector('#nxdt-queue-resume');
    if (resumeBtn) {
      resumeBtn.addEventListener('click', () => {
        this.sendQueueMessage(MESSAGE_TYPES.QUEUE_RESUME);
        showToast('Queue resumed', 'info');
      });
    }

    const retryBtn = this.container.querySelector('#nxdt-queue-retry');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        this.sendQueueMessage(MESSAGE_TYPES.QUEUE_RETRY_FAILED);
        showToast('Retrying failed downloads', 'info');
      });
    }

    const clearBtn = this.container.querySelector('#nxdt-queue-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        this.sendQueueMessage(MESSAGE_TYPES.QUEUE_CLEAR);
        showToast('Queue cleared', 'info');
      });
    }
    const exportBtn = this.container.querySelector('#nxdt-queue-export');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const text = this.state.items
          .map((i) => `${i.modName} | ${i.fileName} | ${i.sourceUrl || i.externalUrl || i.fileId}`)
          .join('\n');
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(text);
        }
        showToast('Queue item list copied to clipboard', 'success');
      });
    }

    this.container.querySelectorAll('.nxdt-btn-skip').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const itemId = e.target.dataset.itemId;
        if (itemId) {
          this.sendQueueMessage(MESSAGE_TYPES.QUEUE_SKIP_ITEM, { itemId });
          showToast('Download skipped', 'info');
        }
      });
    });
  }
}
