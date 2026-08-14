import { DEFAULT_SETTINGS } from '../storage/defaults.js';
import { STORAGE_KEY_SETTINGS, MESSAGE_TYPES } from '../shared/constants.js';
import { createLogger } from '../shared/logger.js';
import { PRESETS } from './presets.js';

const log = createLogger('options');

const form = {
  enabled: document.querySelector('input[name="enabled"]'),
  handleCollections: document.querySelector('input[name="handleCollections"]'),
  autoStartDownload: document.querySelector('input[name="autoStartDownload"]'),
  skipRequirements: document.querySelector('input[name="skipRequirements"]'),
  forceModManagerDownload: document.querySelector('input[name="forceModManagerDownload"]'),
  handleArchivedFiles: document.querySelector('input[name="handleArchivedFiles"]'),
  autoCloseTab: document.querySelector('input[name="autoCloseTab"]'),
  closeTabDelay: document.querySelector('input[name="closeTabDelay"]'),
  maxConcurrentDownloads: document.querySelector('input[name="maxConcurrentDownloads"]'),
  retryAttempts: document.querySelector('input[name="retryAttempts"]'),
  retryBackoffBaseMs: document.querySelector('input[name="retryBackoffBaseMs"]'),
  collectionPauseBetweenDownload: document.querySelector('input[name="collectionPauseBetweenDownload"]'),
  collectionDownloadSpeed: document.querySelector('input[name="collectionDownloadSpeed"]'),
  notifyOnQueueCompletion: document.querySelector('input[name="notifyOnQueueCompletion"]'),
  collectionDownloadMethod: document.querySelectorAll('input[name="collectionDownloadMethod"]'),
  enableSearchCardButtons: document.querySelector('input[name="enableSearchCardButtons"]'),
  enableRequirementsBundler: document.querySelector('input[name="enableRequirementsBundler"]'),
  enableArchiveInspector: document.querySelector('input[name="enableArchiveInspector"]'),
  organizeDownloads: document.querySelector('input[name="organizeDownloads"]'),
  downloadFolderTemplate: document.querySelector('input[name="downloadFolderTemplate"]'),
  generateMo2Meta: document.querySelector('input[name="generateMo2Meta"]'),
  debugLogging: document.querySelector('input[name="debugLogging"]'),
  requestTimeout: document.querySelector('input[name="requestTimeout"]'),
  saveBtn: document.getElementById('save-btn'),
  resetBtn: document.getElementById('reset-btn'),
  searchInput: document.getElementById('settings-search'),
};

function boolInput(input, name, settings) {
  if (!input) return;
  const raw = settings[name];
  const checked = raw === undefined ? DEFAULT_SETTINGS[name] : !!raw;
  input.checked = !!checked;
}

function numInput(input, name, settings) {
  if (!input) return;
  input.value = settings[name] !== undefined ? settings[name] : DEFAULT_SETTINGS[name];
}

function textInput(input, name, settings) {
  if (!input) return;
  input.value = settings[name] !== undefined ? settings[name] : (DEFAULT_SETTINGS[name] || '');
}

function radioInput(inputs, name, settings) {
  if (!inputs || !inputs.length) return;
  const raw = settings[name];
  const value = raw === undefined ? DEFAULT_SETTINGS[name] : raw;
  for (const input of inputs) {
    input.checked = String(input.value) === String(value);
  }
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
  boolInput(form.autoStartDownload, 'autoStartDownload', settings);
  boolInput(form.skipRequirements, 'skipRequirements', settings);
  boolInput(form.forceModManagerDownload, 'forceModManagerDownload', settings);
  boolInput(form.handleArchivedFiles, 'handleArchivedFiles', settings);
  boolInput(form.autoCloseTab, 'autoCloseTab', settings);
  boolInput(form.notifyOnQueueCompletion, 'notifyOnQueueCompletion', settings);
  boolInput(form.enableSearchCardButtons, 'enableSearchCardButtons', settings);
  boolInput(form.enableRequirementsBundler, 'enableRequirementsBundler', settings);
  boolInput(form.enableArchiveInspector, 'enableArchiveInspector', settings);
  boolInput(form.organizeDownloads, 'organizeDownloads', settings);
  boolInput(form.generateMo2Meta, 'generateMo2Meta', settings);
  boolInput(form.debugLogging, 'debugLogging', settings);

  numInput(form.closeTabDelay, 'closeTabDelay', settings);
  numInput(form.maxConcurrentDownloads, 'maxConcurrentDownloads', settings);
  numInput(form.retryAttempts, 'retryAttempts', settings);
  numInput(form.retryBackoffBaseMs, 'retryBackoffBaseMs', settings);
  numInput(form.collectionPauseBetweenDownload, 'collectionPauseBetweenDownload', settings);
  numInput(form.collectionDownloadSpeed, 'collectionDownloadSpeed', settings);
  numInput(form.requestTimeout, 'requestTimeout', settings);

  textInput(form.downloadFolderTemplate, 'downloadFolderTemplate', settings);
  radioInput(form.collectionDownloadMethod, 'collectionDownloadMethod', settings);
}

function loadSettings() {
  chrome.storage.local.get([STORAGE_KEY_SETTINGS], (res) => {
    const settings = res[STORAGE_KEY_SETTINGS] || {};
    populateForm(settings);
  });
}

function collect() {
  const settings = {};
  if (form.enabled) settings.enabled = !!form.enabled.checked;
  if (form.handleCollections) settings.handleCollections = !!form.handleCollections.checked;
  if (form.autoStartDownload) settings.autoStartDownload = !!form.autoStartDownload.checked;
  if (form.skipRequirements) settings.skipRequirements = !!form.skipRequirements.checked;
  if (form.forceModManagerDownload) settings.forceModManagerDownload = !!form.forceModManagerDownload.checked;
  if (form.handleArchivedFiles) settings.handleArchivedFiles = !!form.handleArchivedFiles.checked;
  if (form.autoCloseTab) settings.autoCloseTab = !!form.autoCloseTab.checked;
  if (form.notifyOnQueueCompletion) settings.notifyOnQueueCompletion = !!form.notifyOnQueueCompletion.checked;
  if (form.enableSearchCardButtons) settings.enableSearchCardButtons = !!form.enableSearchCardButtons.checked;
  if (form.enableRequirementsBundler) settings.enableRequirementsBundler = !!form.enableRequirementsBundler.checked;
  if (form.enableArchiveInspector) settings.enableArchiveInspector = !!form.enableArchiveInspector.checked;
  if (form.organizeDownloads) settings.organizeDownloads = !!form.organizeDownloads.checked;
  if (form.generateMo2Meta) settings.generateMo2Meta = !!form.generateMo2Meta.checked;
  if (form.debugLogging) settings.debugLogging = !!form.debugLogging.checked;

  settings.closeTabDelay = numValue(form.closeTabDelay, DEFAULT_SETTINGS.closeTabDelay);
  settings.maxConcurrentDownloads = numValue(form.maxConcurrentDownloads, DEFAULT_SETTINGS.maxConcurrentDownloads);
  settings.retryAttempts = numValue(form.retryAttempts, DEFAULT_SETTINGS.retryAttempts);
  settings.retryBackoffBaseMs = numValue(form.retryBackoffBaseMs, DEFAULT_SETTINGS.retryBackoffBaseMs);
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
  settings.downloadFolderTemplate = form.downloadFolderTemplate?.value || DEFAULT_SETTINGS.downloadFolderTemplate;

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

function save() {
  const settings = collect();
  chrome.storage.local.set({ [STORAGE_KEY_SETTINGS]: settings }, () => {
    log.info('Settings saved');
    chrome.runtime.sendMessage({ type: MESSAGE_TYPES.SETTINGS_CHANGED, payload: { settings } });

    if (form.saveBtn) {
      form.saveBtn.textContent = '✓ Saved!';
      setTimeout(() => {
        form.saveBtn.textContent = 'Save Settings';
      }, 1500);
    }
  });
}

function applyPreset(presetKey) {
  const preset = PRESETS[presetKey];
  if (!preset) return;

  chrome.storage.local.get([STORAGE_KEY_SETTINGS], (res) => {
    const current = res[STORAGE_KEY_SETTINGS] || {};
    const merged = { ...current, ...preset.settings };
    populateForm(merged);
    save();
  });
}

// Preset Buttons Setup
document.querySelectorAll('.preset-btn').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    const key = e.currentTarget.dataset.preset;
    if (key) applyPreset(key);
  });
});

// Live Search Filter
if (form.searchInput) {
  form.searchInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase().trim();
    const sections = document.querySelectorAll('.settings-section');
    sections.forEach((sec) => {
      const labels = sec.querySelectorAll('label, .group-label');
      let hasMatch = false;
      labels.forEach((lbl) => {
        const text = lbl.textContent.toLowerCase();
        if (!term || text.includes(term)) {
          lbl.style.display = 'flex';
          hasMatch = true;
        } else {
          lbl.style.display = 'none';
        }
      });
      sec.style.display = hasMatch ? 'block' : 'none';
    });
  });
}

if (form.saveBtn) form.saveBtn.addEventListener('click', save);
if (form.resetBtn) {
  form.resetBtn.addEventListener('click', () => {
    chrome.storage.local.remove(STORAGE_KEY_SETTINGS, () => {
      loadSettings();
      chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.SETTINGS_CHANGED,
        payload: { settings: DEFAULT_SETTINGS },
      });
    });
  });
}

document.addEventListener('DOMContentLoaded', loadSettings);
