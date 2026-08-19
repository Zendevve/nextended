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
  toast: document.getElementById('toast'),
};

let toastTimer = null;
function showToast(message, type = 'success', duration = 2500) {
  const toastEl = form.toast || document.getElementById('toast');
  if (!toastEl) return;

  if (toastTimer) clearTimeout(toastTimer);
  toastEl.textContent = message;
  toastEl.className = `toast show toast-${type}`;

  toastTimer = setTimeout(() => {
    toastEl.classList.remove('show');
  }, duration);
}

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

function save(notifyToast = true) {
  const settings = collect();
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  chrome.storage.local.set({ [STORAGE_KEY_SETTINGS]: settings }, () => {
    log.info('Settings saved');
    chrome.runtime?.sendMessage?.({ type: MESSAGE_TYPES.SETTINGS_CHANGED, payload: { settings } });

    if (form.saveBtn) {
      form.saveBtn.textContent = 'Saved!';
      setTimeout(() => {
        form.saveBtn.textContent = 'Save Settings';
      }, 1500);
    }

    if (notifyToast) {
      showToast('Settings saved successfully', 'success');
    }
  });
}

function applyPreset(presetKey) {
  const preset = PRESETS[presetKey];
  if (!preset) return;

  document.querySelectorAll('.preset-btn').forEach((btn) => {
    const isThis = btn.dataset.preset === presetKey;
    btn.classList.toggle('active', isThis);
  });

  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  chrome.storage.local.get([STORAGE_KEY_SETTINGS], (res) => {
    const current = res[STORAGE_KEY_SETTINGS] || {};
    const merged = { ...current, ...preset.settings };
    populateForm(merged);
    save(false);
    showToast(`Applied preset: ${preset.name || presetKey}`, 'success');
  });
}

// Preset Buttons Setup
document.querySelectorAll('.preset-btn').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    const key = e.currentTarget.dataset.preset;
    if (key) applyPreset(key);
  });
});

// Category Tab Navigation
const tabButtons = Array.from(document.querySelectorAll('.tab-btn'));
const sections = Array.from(document.querySelectorAll('.settings-section'));

function restoreControlRows() {
  const rows = document.querySelectorAll('.settings-section label, .settings-section .input-row, .settings-section .radio-group-container');
  rows.forEach((r) => {
    r.style.display = '';
  });
}

function selectTab(targetTab) {
  if (!targetTab) return;
  tabButtons.forEach((tab) => {
    const isSelected = tab === targetTab;
    tab.classList.toggle('active', isSelected);
    tab.setAttribute('aria-selected', isSelected ? 'true' : 'false');
    tab.setAttribute('tabindex', isSelected ? '0' : '-1');
  });

  const controls = targetTab.getAttribute('aria-controls') || '';
  const targetIds = controls.split(/\s+/).filter(Boolean);

  if (targetTab.id === 'tab-all') {
    sections.forEach((sec) => {
      sec.style.display = 'block';
    });
  } else {
    sections.forEach((sec) => {
      const match = targetIds.includes(sec.id);
      sec.style.display = match ? 'block' : 'none';
    });
  }

  restoreControlRows();
}

function setupTabNavigation() {
  tabButtons.forEach((tab, index) => {
    tab.addEventListener('click', () => {
      if (form.searchInput && form.searchInput.value.trim()) {
        form.searchInput.value = '';
      }
      selectTab(tab);
    });

    tab.addEventListener('keydown', (e) => {
      let nextIndex = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        nextIndex = (index + 1) % tabButtons.length;
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        nextIndex = (index - 1 + tabButtons.length) % tabButtons.length;
      } else if (e.key === 'Home') {
        nextIndex = 0;
      } else if (e.key === 'End') {
        nextIndex = tabButtons.length - 1;
      }

      if (nextIndex !== null) {
        e.preventDefault();
        const nextTab = tabButtons[nextIndex];
        nextTab.focus();
        if (form.searchInput && form.searchInput.value.trim()) {
          form.searchInput.value = '';
        }
        selectTab(nextTab);
      }
    });
  });
}

// Live Search Filter
function setupSearchFilter() {
  if (!form.searchInput) return;

  form.searchInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase().trim();
    if (!term) {
      const activeTab = tabButtons.find((tab) => tab.classList.contains('active')) || tabButtons[0];
      selectTab(activeTab);
      return;
    }

    sections.forEach((sec) => {
      const rows = sec.querySelectorAll('label, .input-row, .radio-group-container');
      let hasMatch = false;
      rows.forEach((row) => {
        const text = row.textContent.toLowerCase();
        if (text.includes(term)) {
          row.style.display = '';
          hasMatch = true;
        } else {
          row.style.display = 'none';
        }
      });
      sec.style.display = hasMatch ? 'block' : 'none';
    });
  });
}

if (form.saveBtn) form.saveBtn.addEventListener('click', () => save(true));
if (form.resetBtn) {
  form.resetBtn.addEventListener('click', () => {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
    chrome.storage.local.remove(STORAGE_KEY_SETTINGS, () => {
      loadSettings();
      chrome.runtime?.sendMessage?.({
        type: MESSAGE_TYPES.SETTINGS_CHANGED,
        payload: { settings: DEFAULT_SETTINGS },
      });
      showToast('Settings reset to defaults', 'info');
    });
  });
}

// Inventory Manager Setup
function setupInventoryManager() {
  const importBtn = document.getElementById('import-inv-btn');
  const clearBtn = document.getElementById('clear-inv-btn');
  const domainInput = document.getElementById('inv-game-domain');
  const typeSelect = document.getElementById('inv-manager-type');
  const pasteArea = document.getElementById('inv-paste-area');
  const statusMsg = document.getElementById('inv-status-msg');

  if (importBtn) {
    importBtn.addEventListener('click', async () => {
      const gameDomain = domainInput?.value?.trim() || 'skyrimspecialedition';
      const managerType = typeSelect?.value || 'mo2';
      const rawText = pasteArea?.value || '';

      if (!rawText.trim()) {
        showToast('Please paste modlist text before importing', 'warning');
        return;
      }

      try {
        const res = await chrome.runtime?.sendMessage?.({
          type: MESSAGE_TYPES.IMPORT_INVENTORY,
          payload: {
            gameDomain,
            managerType,
            data: { rawText, modlistText: rawText },
          },
        });

        const data = res?.result || res;
        if (data?.modCount != null) {
          showToast(`Indexed ${data.modCount} mods for ${gameDomain}`, 'success');
          if (statusMsg) statusMsg.textContent = `Indexed ${data.modCount} mods`;
        } else {
          showToast('Failed to parse mod inventory', 'warning');
        }
      } catch {
        showToast('Error importing inventory', 'warning');
      }
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', async () => {
      const gameDomain = domainInput?.value?.trim() || 'skyrimspecialedition';
      try {
        await chrome.runtime?.sendMessage?.({
          type: MESSAGE_TYPES.CLEAR_INVENTORY,
          payload: { gameDomain },
        });
        showToast(`Cleared inventory for ${gameDomain}`, 'info');
        if (pasteArea) pasteArea.value = '';
        if (statusMsg) statusMsg.textContent = 'Cleared';
      } catch {
        showToast('Error clearing inventory', 'warning');
      }
    });
  }
}

setupTabNavigation();
setupSearchFilter();
setupInventoryManager();

document.addEventListener('DOMContentLoaded', loadSettings);
