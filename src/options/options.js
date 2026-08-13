import { DEFAULT_SETTINGS } from '../storage/defaults.js';
import { STORAGE_KEY_SETTINGS } from '../shared/constants.js';
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
  collectionPauseBetweenDownload: document.querySelector('input[name="collectionPauseBetweenDownload"]'),
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
    numInput(form.collectionPauseBetweenDownload, 'collectionPauseBetweenDownload', settings);
    numInput(form.requestTimeout, 'requestTimeout', settings);
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
  if (form.collectionPauseBetweenDownload) {
    settings.collectionPauseBetweenDownload = parseInt(form.collectionPauseBetweenDownload.value, 10) || 5;
  }
  if (form.requestTimeout) {
    settings.requestTimeout = parseInt(form.requestTimeout.value, 10) || DEFAULT_SETTINGS.requestTimeout;
  }
  return settings;
}

function save() {
  const settings = collect();
  chrome.storage.local.set({ [STORAGE_KEY_SETTINGS]: settings }, () => {
    log.info('Settings saved');
    chrome.runtime.sendMessage({ type: 'NXDT_SETTINGS_CHANGED', payload: { settings } });
  });
}

if (form.saveBtn) form.saveBtn.addEventListener('click', save);
if (form.resetBtn) {
  form.resetBtn.addEventListener('click', () => {
    chrome.storage.local.remove(STORAGE_KEY_SETTINGS, () => {
      loadSettings();
      chrome.runtime.sendMessage({
        type: 'NXDT_SETTINGS_CHANGED',
        payload: { settings: DEFAULT_SETTINGS },
      });
    });
  });
}

document.addEventListener('DOMContentLoaded', loadSettings);
