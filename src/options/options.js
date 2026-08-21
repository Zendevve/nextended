import { DEFAULT_SETTINGS } from '../storage/defaults.js';
import { STORAGE_KEY_SETTINGS } from '../shared/constants.js';
import { createLogger } from '../shared/logger.js';
import { PRESETS } from './presets.js';

const log = createLogger('options');

const form = {
  enabled: document.querySelector('input[name="enabled"]'),
  handleCollections: document.querySelector('input[name="handleCollections"]'),
  collectionSafetyPause: document.querySelector('input[name="collectionSafetyPause"]'),
  collectionAutoSkipDownloaded: document.querySelector('input[name="collectionAutoSkipDownloaded"]'),
  collectionPauseBetweenDownload: document.querySelector('input[name="collectionPauseBetweenDownload"]'),
  collectionDownloadSpeed: document.querySelector('input[name="collectionDownloadSpeed"]'),
  collectionDownloadMethod: document.querySelectorAll('input[name="collectionDownloadMethod"]'),
  autoStartDownload: document.querySelector('input[name="autoStartDownload"]'),
  skipRequirements: document.querySelector('input[name="skipRequirements"]'),
  forceModManagerDownload: document.querySelector('input[name="forceModManagerDownload"]'),
  handleArchivedFiles: document.querySelector('input[name="handleArchivedFiles"]'),
  downloadButtonColor: document.querySelector('input[name="downloadButtonColor"]'),
  vpnMode: document.querySelector('input[name="vpnMode"]'),
  autoCloseTab: document.querySelector('input[name="autoCloseTab"]'),
  closeTabDelay: document.querySelector('input[name="closeTabDelay"]'),
  debugLogging: document.querySelector('input[name="debugLogging"]'),
  requestTimeout: document.querySelector('input[name="requestTimeout"]'),
  saveBtn: document.getElementById('save-btn'),
  resetBtn: document.getElementById('reset-btn'),
  searchInput: document.getElementById('settings-search'),
  toast: document.getElementById('toast'),
};

let toastTimer = null;
function showToast(message, type = 'success', duration = 2500) {
  const toastEl = form.toast || document.getElementById('toast');
  if (!toastEl) return;

  if (toastTimer) clearTimeout(toastTimer);

  toastEl.textContent = message;
  toastEl.className = `toast toast-${type} toast-visible`;

  toastTimer = setTimeout(() => {
    toastEl.className = `toast toast-${type}`;
  }, duration);
}

function boolInput(input, name, settings) {
  if (input) {
    input.checked = settings[name] !== undefined ? !!settings[name] : !!DEFAULT_SETTINGS[name];
  }
}

function numInput(input, name, settings) {
  if (input) {
    input.value = settings[name] !== undefined ? settings[name] : DEFAULT_SETTINGS[name];
  }
}

function radioInput(inputs, name, settings) {
  if (!inputs || !inputs.length) return;
  const val = settings[name] !== undefined ? settings[name] : DEFAULT_SETTINGS[name];
  inputs.forEach((input) => {
    input.checked = parseInt(input.value, 10) === val;
  });
}

function numValue(input, fallback, useFloat = false) {
  if (!input) return fallback;
  const v = input.value;
  if (v === '') return fallback;
  const parsed = useFloat ? parseFloat(v) : parseInt(v, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function populateForm(settings) {
  boolInput(form.enabled, 'enabled', settings);
  boolInput(form.handleCollections, 'handleCollections', settings);
  boolInput(form.collectionSafetyPause, 'collectionSafetyPause', settings);
  boolInput(form.collectionAutoSkipDownloaded, 'collectionAutoSkipDownloaded', settings);
  boolInput(form.autoStartDownload, 'autoStartDownload', settings);
  boolInput(form.skipRequirements, 'skipRequirements', settings);
  boolInput(form.forceModManagerDownload, 'forceModManagerDownload', settings);
  boolInput(form.handleArchivedFiles, 'handleArchivedFiles', settings);
  boolInput(form.downloadButtonColor, 'downloadButtonColor', settings);
  boolInput(form.vpnMode, 'vpnMode', settings);
  boolInput(form.autoCloseTab, 'autoCloseTab', settings);
  boolInput(form.debugLogging, 'debugLogging', settings);

  numInput(form.closeTabDelay, 'closeTabDelay', settings);
  numInput(form.collectionPauseBetweenDownload, 'collectionPauseBetweenDownload', settings);
  numInput(form.collectionDownloadSpeed, 'collectionDownloadSpeed', settings);
  numInput(form.requestTimeout, 'requestTimeout', settings);

  radioInput(form.collectionDownloadMethod, 'collectionDownloadMethod', settings);
}

function loadSettings() {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  chrome.storage.local.get([STORAGE_KEY_SETTINGS], (res) => {
    const settings = res[STORAGE_KEY_SETTINGS] || {};
    populateForm(settings);
  });
}

function collect() {
  const settings = {};
  if (form.enabled) settings.enabled = !!form.enabled.checked;
  if (form.handleCollections) settings.handleCollections = !!form.handleCollections.checked;
  if (form.collectionSafetyPause) settings.collectionSafetyPause = !!form.collectionSafetyPause.checked;
  if (form.collectionAutoSkipDownloaded) settings.collectionAutoSkipDownloaded = !!form.collectionAutoSkipDownloaded.checked;
  if (form.autoStartDownload) settings.autoStartDownload = !!form.autoStartDownload.checked;
  if (form.skipRequirements) settings.skipRequirements = !!form.skipRequirements.checked;
  if (form.forceModManagerDownload) settings.forceModManagerDownload = !!form.forceModManagerDownload.checked;
  if (form.handleArchivedFiles) settings.handleArchivedFiles = !!form.handleArchivedFiles.checked;
  if (form.downloadButtonColor) settings.downloadButtonColor = !!form.downloadButtonColor.checked;
  if (form.vpnMode) settings.vpnMode = !!form.vpnMode.checked;
  if (form.autoCloseTab) settings.autoCloseTab = !!form.autoCloseTab.checked;
  if (form.debugLogging) settings.debugLogging = !!form.debugLogging.checked;

  settings.closeTabDelay = numValue(form.closeTabDelay, DEFAULT_SETTINGS.closeTabDelay);
  settings.collectionPauseBetweenDownload = numValue(
    form.collectionPauseBetweenDownload,
    DEFAULT_SETTINGS.collectionPauseBetweenDownload
  );
  settings.collectionDownloadSpeed = numValue(
    form.collectionDownloadSpeed,
    DEFAULT_SETTINGS.collectionDownloadSpeed,
    true
  );
  settings.requestTimeout = numValue(form.requestTimeout, DEFAULT_SETTINGS.requestTimeout);

  if (form.collectionDownloadMethod) {
    const checked = Array.from(form.collectionDownloadMethod).find((input) => input.checked);
    if (checked) {
      const v = parseInt(checked.value, 10);
      settings.collectionDownloadMethod = Number.isFinite(v)
        ? v
        : DEFAULT_SETTINGS.collectionDownloadMethod;
    }
  }
  return settings;
}

function save(notifyToast = true) {
  const settings = collect();
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  chrome.storage.local.set({ [STORAGE_KEY_SETTINGS]: settings }, () => {
    if (chrome.runtime?.lastError) {
      log.error('Failed to save settings', { error: chrome.runtime.lastError.message });
      if (notifyToast) showToast('Failed to save settings', 'error');
      return;
    }
    log.info('Settings saved', settings);
    if (notifyToast) showToast('Settings saved successfully', 'success');
  });
}

function applyPreset(presetKey) {
  const preset = PRESETS[presetKey];
  if (!preset) return;

  populateForm(preset.settings);
  save(false);

  document.querySelectorAll('.preset-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.preset === presetKey);
  });

  showToast(`Applied preset: ${preset.name}`, 'info', 2000);
}

// Preset Buttons Setup
document.querySelectorAll('.preset-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const presetKey = btn.getAttribute('data-preset');
    if (presetKey) applyPreset(presetKey);
  });
});

// Category Tab Navigation
const tabButtons = Array.from(document.querySelectorAll('.tab-btn'));
const sections = Array.from(document.querySelectorAll('.settings-section'));

function restoreControlRows() {
  document.querySelectorAll('.section-card label, .input-group-vertical').forEach((el) => {
    el.style.display = '';
  });
}

function selectTab(targetTab) {
  tabButtons.forEach((btn) => {
    const isActive = btn.id === targetTab;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    btn.setAttribute('tabindex', isActive ? '0' : '-1');
  });

  if (targetTab === 'tab-all') {
    sections.forEach((sec) => {
      sec.style.display = '';
    });
    restoreControlRows();
    return;
  }

  const targetSectionId = targetTab.replace('tab-', 'section-');
  sections.forEach((sec) => {
    sec.style.display = sec.id === targetSectionId ? '' : 'none';
  });
  restoreControlRows();
}

function setupTabNavigation() {
  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      selectTab(btn.id);
    });
    btn.addEventListener('keydown', (e) => {
      const index = tabButtons.indexOf(btn);
      if (index === -1) return;
      if (e.key === 'ArrowRight') {
        const next = tabButtons[(index + 1) % tabButtons.length];
        next.focus();
        selectTab(next.id);
      } else if (e.key === 'ArrowLeft') {
        const prev = tabButtons[(index - 1 + tabButtons.length) % tabButtons.length];
        prev.focus();
        selectTab(prev.id);
      }
    });
  });
}

// Live Search Filter
function setupSearchFilter() {
  if (!form.searchInput) return;
  form.searchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim().toLowerCase();
    if (!query) {
      const activeTab = document.querySelector('.tab-btn.active');
      selectTab(activeTab ? activeTab.id : 'tab-all');
      return;
    }

    sections.forEach((sec) => {
      let secHasMatch = false;
      const labels = sec.querySelectorAll('.section-card label, .input-group-vertical');
      labels.forEach((label) => {
        const title = label.querySelector('.control-title, .group-label')?.textContent.toLowerCase() || '';
        const hint = label.querySelector('.control-hint')?.textContent.toLowerCase() || '';
        const match = title.includes(query) || hint.includes(query);
        label.style.display = match ? '' : 'none';
        if (match) secHasMatch = true;
      });
      sec.style.display = secHasMatch ? '' : 'none';
    });
  });
}

if (form.saveBtn) form.saveBtn.addEventListener('click', () => save(true));
if (form.resetBtn) {
  form.resetBtn.addEventListener('click', () => {
    populateForm(DEFAULT_SETTINGS);
    save(false);
    document.querySelectorAll('.preset-btn').forEach((btn) => btn.classList.remove('active'));
    showToast('Reset to default settings', 'info');
  });
}

setupTabNavigation();
setupSearchFilter();

document.addEventListener('DOMContentLoaded', loadSettings);
