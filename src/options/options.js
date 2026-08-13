import { DEFAULT_SETTINGS } from '../storage/defaults.js';
import { STORAGE_KEY_SETTINGS, MESSAGE_TYPES } from '../shared/constants.js';
import { createLogger } from '../shared/logger.js';

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
  collectionPauseBetweenDownload: document.querySelector('input[name="collectionPauseBetweenDownload"]'),
  collectionDownloadSpeed: document.querySelector('input[name="collectionDownloadSpeed"]'),
  collectionDownloadMethod: document.querySelectorAll('input[name="collectionDownloadMethod"]'),
  debugLogging: document.querySelector('input[name="debugLogging"]'),
  requestTimeout: document.querySelector('input[name="requestTimeout"]'),
  saveBtn: document.getElementById('save-btn'),
  resetBtn: document.getElementById('reset-btn'),
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

function radioInput(inputs, name, settings) {
  if (!inputs || !inputs.length) return;
  const raw = settings[name];
  const value = raw === undefined ? DEFAULT_SETTINGS[name] : raw;
  for (const input of inputs) {
    input.checked = String(input.value) === String(value);
  }
}

// Preserve 0: empty/invalid input falls back to DEFAULT, a valid 0 is kept
// (never use `|| DEFAULT`, which turns 0 into DEFAULT).
function numValue(input, fallback, useFloat = false) {
  if (!input) return fallback;
  const v = input.value;
  if (v === '') return fallback;
  const parsed = useFloat ? parseFloat(v) : parseInt(v, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function loadSettings() {
  chrome.storage.local.get([STORAGE_KEY_SETTINGS], (res) => {
    const settings = res[STORAGE_KEY_SETTINGS] || {};
    boolInput(form.enabled, 'enabled', settings);
    boolInput(form.handleCollections, 'handleCollections', settings);
    boolInput(form.autoStartDownload, 'autoStartDownload', settings);
    boolInput(form.skipRequirements, 'skipRequirements', settings);
    boolInput(form.forceModManagerDownload, 'forceModManagerDownload', settings);
    boolInput(form.handleArchivedFiles, 'handleArchivedFiles', settings);
    boolInput(form.autoCloseTab, 'autoCloseTab', settings);
    boolInput(form.debugLogging, 'debugLogging', settings);
    numInput(form.closeTabDelay, 'closeTabDelay', settings);
    numInput(form.collectionPauseBetweenDownload, 'collectionPauseBetweenDownload', settings);
    numInput(form.collectionDownloadSpeed, 'collectionDownloadSpeed', settings);
    numInput(form.requestTimeout, 'requestTimeout', settings);
    radioInput(form.collectionDownloadMethod, 'collectionDownloadMethod', settings);
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

function save() {
  const settings = collect();
  chrome.storage.local.set({ [STORAGE_KEY_SETTINGS]: settings }, () => {
    log.info('Settings saved');
    chrome.runtime.sendMessage({ type: MESSAGE_TYPES.SETTINGS_CHANGED, payload: { settings } });
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
