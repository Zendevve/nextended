import { DEFAULT_SETTINGS } from '../storage/defaults.js';
import { STORAGE_KEY_SETTINGS } from '../shared/constants.js';
import { createLogger } from '../shared/logger.js';

const log = createLogger('options');

const form = {
  enabled: document.querySelector('input[name="enabled"]'),
  handleArchivedFiles: document.querySelector('input[name="handleArchivedFiles"]'),
  manualDownloads: document.querySelector('input[name="manualDownloads"]'),
  modManagerDownloads: document.querySelector('input[name="modManagerDownloads"]'),
  skipRequirements: document.querySelector('input[name="skipRequirements"]'),
  automaticDownloads: document.querySelector('input[name="automaticDownloads"]'),
  showErrorNotifications: document.querySelector('input[name="showErrorNotifications"]'),
  debugLogging: document.querySelector('input[name="debugLogging"]'),
  requestTimeout: document.querySelector('input[name="requestTimeout"]'),
  cloudflareFallback: document.querySelector('input[name="cloudflareFallback"]'),
  saveBtn: document.getElementById('save-btn'),
  resetBtn: document.getElementById('reset-btn'),
};

function boolInput(input, name, settings) {
  if (!input) return;
  const raw = settings[name];
  const checked = raw === undefined ? DEFAULT_SETTINGS[name] : !!raw;
  if (input.type === 'number' && input.dataset.bool === 'true') {
    input.value = checked ? '1' : '0';
    input.checked = false;
  } else {
    input.checked = !!checked;
  }
}

function numInput(input, name, settings) {
  if (!input) return;
  input.value = settings[name] !== undefined ? settings[name] : DEFAULT_SETTINGS[name];
}

function selectInput(input, name, settings) {
  if (!input) return;
  const val = settings[name] || DEFAULT_SETTINGS[name];
  for (const opt of input.options || []) {
    opt.selected = opt.value === val;
  }
}

function loadSettings() {
  chrome.storage.local.get([STORAGE_KEY_SETTINGS], (res) => {
    const settings = res[STORAGE_KEY_SETTINGS] || {};
    boolInput(form.enabled, 'enabled', settings);
    boolInput(form.handleArchivedFiles, 'handleArchivedFiles', settings);
    boolInput(form.manualDownloads, 'manualDownloads', settings);
    boolInput(form.modManagerDownloads, 'modManagerDownloads', settings);
    boolInput(form.skipRequirements, 'skipRequirements', settings);
    boolInput(form.automaticDownloads, 'automaticDownloads', settings);
    boolInput(form.showErrorNotifications, 'showErrorNotifications', settings);
    boolInput(form.debugLogging, 'debugLogging', settings);
    numInput(form.requestTimeout, 'requestTimeout', settings);
    selectInput(form.cloudflareFallback, 'cloudflareFallback', settings);
  });
}

function collect() {
  const settings = {};
  if (form.debugLogging && form.debugLogging.type === 'number') {
    settings.debugLogging = form.debugLogging.value === '1';
  } else if (form.debugLogging) {
    settings.debugLogging = !!form.debugLogging.checked;
  }
  settings.enabled = !!form.enabled.checked;
  settings.handleArchivedFiles = !!form.handleArchivedFiles.checked;
  settings.manualDownloads = !!form.manualDownloads.checked;
  settings.modManagerDownloads = !!form.modManagerDownloads.checked;
  settings.skipRequirements = !!form.skipRequirements.checked;
  settings.automaticDownloads = !!form.automaticDownloads.checked;
  settings.showErrorNotifications = !!form.showErrorNotifications.checked;
  settings.requestTimeout = form.requestTimeout
    ? parseInt(form.requestTimeout.value, 10)
    : DEFAULT_SETTINGS.requestTimeout;
  settings.cloudflareFallback = form.cloudflareFallback && form.cloudflareFallback.value;
  return settings;
}

function save() {
  const settings = collect();
  chrome.storage.local.set({ [STORAGE_KEY_SETTINGS]: settings }, () => {
    log.info('Settings saved');
    chrome.runtime.sendMessage({ type: 'NXDT_SETTINGS_CHANGED', payload: { settings } });
  });
}

form.saveBtn.addEventListener('click', save);
form.resetBtn.addEventListener('click', () => {
  chrome.storage.local.remove(STORAGE_KEY_SETTINGS, () => {
    loadSettings();
    chrome.runtime.sendMessage({
      type: 'NXDT_SETTINGS_CHANGED',
      payload: { settings: DEFAULT_SETTINGS },
    });
  });
});

document.addEventListener('DOMContentLoaded', loadSettings);
