import { BUTTON_STATES, MODE_MANAGER, MODE_MANUAL } from '../shared/constants.js';
import { createLogger } from '../shared/logger.js';
import { isSafeDownloadUrl } from '../nexus/url-utils.js';

const log = createLogger('buttons');

const TEXT = {
  [MODE_MANAGER]: 'Mod Manager Download',
  [MODE_MANUAL]: 'Manual Download',
};

const LABEL = {
  [BUTTON_STATES.READY]: { manager: 'Mod Manager Download', manual: 'Manual Download' },
  [BUTTON_STATES.RESOLVING]: 'Resolving...',
  [BUTTON_STATES.DOWNLOADING]: 'Starting download...',
  [BUTTON_STATES.SUCCESS]: 'Download started',
  [BUTTON_STATES.ERROR]: 'Download failed',
};

export class ButtonManager {
  constructor(options = {}) {
    this.onResolve = options.onResolve || ((_file, _mode) => Promise.resolve());
    this.states = new Map();
    this.timers = new Map();
  }

  injectForFile(file) {
    if (!file || !file.element) {
      log.warn('Cannot inject for missing file', { file });
      return false;
    }
    if (this._hasInjected(file.element)) return false;
    const group = this._createGroup(file);
    const target = this._findAnchorPoint(file.element);
    if (target && target.appendChild) {
      target.appendChild(group);
    } else {
      file.element.appendChild(group);
    }
    this._setState(file.fileId, MODE_MANAGER, BUTTON_STATES.READY);
    this._setState(file.fileId, MODE_MANUAL, BUTTON_STATES.READY);
    log.debug('Buttons injected', { fileId: file.fileId });
    return true;
  }

  injectMany(files) {
    let count = 0;
    for (const f of files) {
      count += this.injectForFile(f) ? 1 : 0;
    }
    return count;
  }

  removeStale() {}

  _hasInjected(element) {
    return !!element.querySelector('[data-nxdt="true"]');
  }

  _findAnchorPoint(element) {
    return element.querySelector('.file-actions, .actions, .download-links') || null;
  }

  _createGroup(file) {
    const group = document.createElement('span');
    group.className = 'nxdt-button-group';
    group.setAttribute('data-nxdt', 'true');
    group.setAttribute('data-nxdt-file-id', file.fileId);
    group.setAttribute('aria-label', `${file.name} download controls`);

    for (const mode of [MODE_MANAGER, MODE_MANUAL]) {
      group.appendChild(this._createButton(file, mode));
    }
    return group;
  }

  _createButton(file, mode) {
    const btn = document.createElement('a');
    btn.href = '#';
    btn.className = `nxdt-download-button nxdt-${mode}`;
    btn.setAttribute('role', 'button');
    btn.setAttribute('data-nxdt', 'true');
    btn.setAttribute('data-nxdt-file-id', file.fileId);
    btn.setAttribute('data-nxdt-mode', mode);
    btn.setAttribute('data-nxdt-state', BUTTON_STATES.READY);
    btn.textContent = TEXT[mode];
    btn.title =
      mode === MODE_MANAGER ? 'Mod Manager / Vortex download' : 'Manual download';

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._handleClick(file, mode, btn);
    });
    return btn;
  }

  _key(fileId, mode) {
    return `${fileId}:${mode}`;
  }

  _setState(fileId, mode, state, extra) {
    const key = this._key(fileId, mode);
    this.states.set(key, { state, ...extra });
    const btn = document.querySelector(
      `[data-nxdt-file-id="${CSS.escape(fileId)}"][data-nxdt-mode="${mode}"]`
    );
    if (!btn) return;
    btn.setAttribute('data-nxdt-state', state);
    btn.disabled =
      state === BUTTON_STATES.RESOLVING || state === BUTTON_STATES.DOWNLOADING;
    btn.textContent = this._labelFor(mode, state);
    btn.style.opacity =
      state === BUTTON_STATES.RESOLVING || state === BUTTON_STATES.DOWNLOADING
        ? '0.6'
        : '1';
  }

  _labelFor(mode, state) {
    const override = LABEL[state];
    if (state === BUTTON_STATES.READY) {
      return mode === MODE_MANAGER ? LABEL.READY.manager : LABEL.READY.manual;
    }
    return typeof override === 'string' ? override : override[mode] || TEXT[mode];
  }

  _clearTimer(fileId, mode) {
    const timer = this.timers.get(this._key(fileId, mode));
    if (timer) clearTimeout(timer);
    this.timers.delete(this._key(fileId, mode));
  }

  async _handleClick(file, mode, _btn) {
    if (this.states.get(this._key(file.fileId, mode))?.state === BUTTON_STATES.RESOLVING)
      return;
    this._setState(file.fileId, mode, BUTTON_STATES.RESOLVING);
    this._clearTimer(file.fileId, mode);

    let outcome;
    try {
      outcome = await this.onResolve(file, mode);
    } catch (e) {
      this._setError(file.fileId, mode, e);
      return;
    }

    if (!outcome) return;
    if (outcome.action === 'open') {
      if (isSafeDownloadUrl(outcome.url) || /^nxm:/i.test(outcome.url)) {
        window.open(outcome.url, '_blank', 'noopener,noreferrer');
      }
      this._setState(file.fileId, mode, BUTTON_STATES.SUCCESS);
      this._scheduleReset(file.fileId, mode);
    } else if (outcome.action === 'download') {
      this._setState(file.fileId, mode, BUTTON_STATES.SUCCESS);
      this._scheduleReset(file.fileId, mode);
    }
  }

  _setError(fileId, mode, error) {
    const code = error && error.code;
    const message = error && error.message ? error.message : String(error);
    log.error('Download failed', { fileId, mode, code, message });
    this._setState(fileId, mode, BUTTON_STATES.ERROR, { error: message, code });

    const btn = document.querySelector(
      `[data-nxdt-file-id="${CSS.escape(fileId)}"][data-nxdt-mode="${mode}"]`
    );
    if (btn) {
      btn.textContent = `Failed: ${message}`;
      btn.classList.add('nxdt-error');
    }

    if (code === 'CLOUDFLARE' || code === 'REQUIREMENTS') {
      this._addFallbackLink(fileId, mode, code);
    }
    this._scheduleReset(fileId, mode, 5000);
  }

  _addFallbackLink(fileId, mode, code) {
    const existing = document.querySelector(
      `[data-nxdt-fallback="${CSS.escape(fileId)}"]`
    );
    if (existing) return;
    const link = document.createElement('a');
    link.href = '#';
    link.className = 'nxdt-fallback-link';
    link.setAttribute('data-nxdt-fallback', fileId);
    link.textContent =
      '(' + (code === 'CLOUDFLARE' ? 'open in browser' : 'open requirements') + ')';
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const file = this._currentFile(fileId);
      if (file) window.open(file.fallbackUrl || '#', '_blank', 'noopener,noreferrer');
    });
    const btn = document.querySelector(
      `[data-nxdt-file-id="${CSS.escape(fileId)}"][data-nxdt-mode="${mode}"]`
    );
    if (btn) btn.parentNode.insertBefore(link, btn.nextSibling);
  }

  _currentFile(fileId) {
    return this._lastFiles?.[fileId];
  }

  _scheduleReset(fileId, mode, ms = 2000) {
    this._clearTimer(fileId, mode);
    const timer = setTimeout(() => {
      this._setState(fileId, mode, BUTTON_STATES.READY);
      this.timers.delete(this._key(fileId, mode));
    }, ms);
    this.timers.set(this._key(fileId, mode), timer);
  }

  setFilesContext(files) {
    this._lastFiles = {};
    for (const f of files || []) {
      this._lastFiles[f.fileId] = f;
    }
  }

  getState(fileId, mode) {
    return this.states.get(this._key(fileId, mode));
  }

  setVisible(visible) {
    if (visible === this.visible) return;
    this.visible = visible;
    const groups = document.querySelectorAll('[data-nxdt="true"].nxdt-button-group');
    groups.forEach((g) => {
      g.style.display = visible ? '' : 'none';
    });
    log.debug('Button visibility set', { visible });
  }
}
