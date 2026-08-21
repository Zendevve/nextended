import { STORAGE_KEY_SETTINGS, MESSAGE_TYPES } from '../shared/constants.js';

export const DONATE_URL = 'https://buymeacoffee.com/zendevve';

const NEXUS_HOST_RE = /(?:^|\.)nexusmods\.com$/i;
const COLLECTION_PATH_RE = /^\/games\/[^/]+\/collections\/[^/]+(?:\/revisions\/\d+)?\/?$/i;
const MOD_PATH_RE = /^\/[^/]+\/mods\/\d+/i;

const SITE_LABELS = {
  collection: 'Collection',
  mod: 'Mod Page',
  nexus: 'On Nexus Mods',
  'not-nexus': 'Not on Nexus',
};

let currentSettings = {};
let activeTab = null;

function classifyUrl(url) {
  if (typeof url !== 'string' || !url) return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!NEXUS_HOST_RE.test(parsed.hostname)) return 'not-nexus';
  if (COLLECTION_PATH_RE.test(parsed.pathname)) return 'collection';
  if (MOD_PATH_RE.test(parsed.pathname)) return 'mod';
  return 'nexus';
}

function sendMessage(message) {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
      resolve({});
      return;
    }
    chrome.runtime.sendMessage(message, (response) => {
      resolve(response || {});
    });
  });
}

function getActiveTab() {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.tabs?.query) {
      resolve(null);
      return;
    }
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      void chrome.runtime?.lastError;
      resolve(tabs && tabs.length ? tabs[0] : null);
    });
  });
}

function renderDot(alive, settings) {
  const el = document.getElementById('status-dot');
  if (!el) return;
  const enabled = settings.enabled !== false;
  const active = alive && enabled;
  el.classList.toggle('inactive', !active);
  el.setAttribute('title', active ? 'Service Worker Active' : 'Service Worker Inactive');
  el.setAttribute('aria-label', active ? 'Service Worker Active' : 'Service Worker Inactive');
}

function renderSite(tab) {
  const el = document.getElementById('site-name');
  if (!el) return;
  const category = tab && tab.url ? classifyUrl(tab.url) : null;
  el.textContent = category ? SITE_LABELS[category] : SITE_LABELS['not-nexus'];
}

function renderCollectionState(settings) {
  const el = document.getElementById('collection-state');
  if (!el) return;
  const enabled = settings.enabled !== false;
  const handleCollections = settings.handleCollections !== false;
  el.textContent = enabled && handleCollections ? 'On' : 'Off';
}

function renderNowaitState(settings) {
  const el = document.getElementById('nowait-state');
  if (!el) return;
  const enabled = settings.enabled !== false;
  const autoStart = settings.autoStartDownload !== false;
  el.textContent = enabled && autoStart ? 'On' : 'Off';
}

function renderArchivedState(settings) {
  const el = document.getElementById('archived-state');
  if (!el) return;
  const enabled = settings.enabled !== false;
  const handleArchived = settings.handleArchivedFiles !== false;
  el.textContent = enabled && handleArchived ? 'On' : 'Off';
}

function renderStats(stats) {
  const collectionsEl = document.getElementById('collections-count');
  if (collectionsEl) {
    collectionsEl.textContent = (stats && stats.collectionsDownloaded) || '0';
  }
  const autoEl = document.getElementById('autodl-count');
  if (autoEl) {
    autoEl.textContent = (stats && stats.autoDownloadsCompleted) || '0';
  }
}

export async function refresh() {
  const [pingRes, settingsRes] = await Promise.all([
    sendMessage({ type: MESSAGE_TYPES.PING }),
    sendMessage({ type: MESSAGE_TYPES.GET_SETTINGS }),
  ]);

  const alive = pingRes && pingRes.success !== false;
  const settings = (settingsRes && settingsRes.result && settingsRes.result.settings) || settingsRes.settings || {};
  currentSettings = { ...settings };
  activeTab = await getActiveTab();

  renderDot(alive, currentSettings);
  renderSite(activeTab);
  renderCollectionState(currentSettings);
  renderNowaitState(currentSettings);
  renderArchivedState(currentSettings);

  // Stats from storage directly
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.get(['stats'], (res) => {
      void chrome.runtime?.lastError;
      renderStats(res && res.stats);
    });
  }
}

async function toggleSetting(key) {
  const next = { ...currentSettings, [key]: !currentSettings[key] };
  currentSettings = next;
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.set({ [STORAGE_KEY_SETTINGS]: next }, () => {
      void chrome.runtime?.lastError;
      refresh();
    });
  }
}

async function toggleNowait() {
  await toggleSetting('autoStartDownload');
}

async function toggleArchived() {
  await toggleSetting('handleArchivedFiles');
}

function onSiteRowClick() {
  if (activeTab && activeTab.url && NEXUS_HOST_RE.test(new URL(activeTab.url).hostname)) {
    if (typeof chrome !== 'undefined' && chrome.tabs?.update) {
      chrome.tabs.update(activeTab.id, { active: true });
      window.close();
    }
  } else {
    if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
      chrome.tabs.create({ url: 'https://www.nexusmods.com' });
    }
  }
}

function onCollectionRowClick() {
  if (activeTab && activeTab.url && classifyUrl(activeTab.url) === 'collection') {
    sendMessage({ type: MESSAGE_TYPES.FOCUS_COLLECTION_PANEL });
    window.close();
  } else {
    if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
      chrome.tabs.create({ url: 'https://www.nexusmods.com/games' });
    }
  }
}

const siteRow = document.getElementById('site-row');
if (siteRow) siteRow.addEventListener('click', onSiteRowClick);

const collectionRow = document.getElementById('collection-row');
if (collectionRow) collectionRow.addEventListener('click', onCollectionRowClick);

const nowaitRow = document.getElementById('nowait-row');
if (nowaitRow) nowaitRow.addEventListener('click', () => toggleNowait());

const archivedRow = document.getElementById('archived-row');
if (archivedRow) archivedRow.addEventListener('click', () => toggleArchived());

const openSettingsBtn = document.getElementById('open-settings');
if (openSettingsBtn) {
  openSettingsBtn.addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      sendMessage({ type: MESSAGE_TYPES.OPEN_OPTIONS });
    }
  });
}

const openDonateBtn = document.getElementById('open-donate');
if (openDonateBtn) {
  openDonateBtn.addEventListener('click', () => {
    const url = DONATE_URL;
    if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
      chrome.tabs.create({ url });
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  });
}

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage?.addListener) {
  chrome.runtime.onMessage.addListener((message) => {
    if (message && message.type === MESSAGE_TYPES.PING) {
      refresh();
    }
  });
}

if (typeof chrome !== 'undefined' && chrome.storage?.onChanged?.addListener) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[STORAGE_KEY_SETTINGS]) {
      currentSettings = { ...currentSettings, ...changes[STORAGE_KEY_SETTINGS].newValue };
      renderCollectionState(currentSettings);
      renderNowaitState(currentSettings);
      renderArchivedState(currentSettings);
      renderDot(true, currentSettings);
    }
    if (area === 'local' && changes.stats) {
      renderStats(changes.stats.newValue);
    }
  });
}

refresh();
