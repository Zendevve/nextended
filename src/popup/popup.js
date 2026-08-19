import { STORAGE_KEY_SETTINGS, STORAGE_KEY_QUEUE, MESSAGE_TYPES, QUEUE_STATUS } from '../shared/constants.js';

export const DONATE_URL = 'https://buymeacoffee.com/zendevve';

const NEXUS_HOST_RE = /(?:^|\.)nexusmods\.com$/i;
const COLLECTION_PATH_RE = /^\/games\/[^/]+\/collections\/[^/]+(?:\/revisions\/\d+)?\/?$/i;
const MOD_PATH_RE = /^\/[^/]+\/mods\/\d+/i;

const SITE_LABELS = {
  collection: 'Collection page',
  mod: 'Mod page',
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

function isNexusTab(category) {
  return category === 'collection' || category === 'mod' || category === 'nexus';
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

function renderQueueState(queueState) {
  const el = document.getElementById('queue-state');
  if (!el) return;
  const status = queueState?.status || QUEUE_STATUS.IDLE;
  const counts = queueState?.counts || {};
  const total = counts.total || queueState?.items?.length || 0;
  const completed = counts.completed || 0;

  if (status === QUEUE_STATUS.RUNNING) {
    el.textContent = `Active (${completed}/${total})`;
  } else if (status === QUEUE_STATUS.PAUSED) {
    el.textContent = `Paused (${completed}/${total})`;
  } else if (status === QUEUE_STATUS.COMPLETED) {
    el.textContent = `Done (${completed})`;
  } else if (status === QUEUE_STATUS.FAILED) {
    el.textContent = 'Needs Attention';
  } else {
    el.textContent = total > 0 ? `${total} items` : 'Idle';
  }
}

function renderStats(stats) {
  const collectionsEl = document.getElementById('collections-count');
  if (collectionsEl) {
    collectionsEl.textContent = (stats && stats.collectionsDownloaded) || '0';
  }
  const queueItemsEl = document.getElementById('queue-items-count');
  if (queueItemsEl) {
    queueItemsEl.textContent = (stats && stats.queueItemsDownloaded) || '0';
  }
}

export async function refresh() {
  const [pingRes, settingsRes, queueRes] = await Promise.all([
    sendMessage({ type: MESSAGE_TYPES.PING }),
    sendMessage({ type: MESSAGE_TYPES.GET_SETTINGS }),
    sendMessage({ type: MESSAGE_TYPES.GET_QUEUE_STATE }),
  ]);

  const ping = pingRes.result || pingRes || {};
  const alive = ping.alive === true;
  const stats = ping.stats || {};

  const settings = settingsRes.result?.settings || settingsRes.settings || {};
  currentSettings = { ...settings };

  const queueState = queueRes.result || queueRes || {};

  renderDot(alive, settings);
  renderCollectionState(settings);
  renderNowaitState(settings);
  renderQueueState(queueState);
  renderStats(stats);

  activeTab = await getActiveTab();
  renderSite(activeTab);
}

async function toggleNowait() {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  let stored = {};
  try {
    const raw = await chrome.storage.local.get(STORAGE_KEY_SETTINGS);
    stored = (raw && raw[STORAGE_KEY_SETTINGS]) || {};
  } catch {
    stored = {};
  }
  const base =
    typeof stored.autoStartDownload === 'boolean'
      ? stored.autoStartDownload
      : currentSettings.autoStartDownload !== false;
  const next = { ...stored, autoStartDownload: !base };
  try {
    await chrome.storage.local.set({ [STORAGE_KEY_SETTINGS]: next });
  } catch {
    /* storage errors surface via onChanged in real use */
  }
  currentSettings = { ...currentSettings, ...next };
  renderNowaitState(currentSettings);
}

function onSiteRowClick() {
  const category = activeTab && activeTab.url ? classifyUrl(activeTab.url) : null;
  if (activeTab && activeTab.id != null && isNexusTab(category)) {
    if (chrome.tabs?.update) chrome.tabs.update(activeTab.id, { active: true });
  } else if (chrome.tabs?.create) {
    chrome.tabs.create({ url: 'https://www.nexusmods.com/' });
  }
  window.close?.();
}

function onQueueRowClick() {
  if (activeTab && activeTab.id != null) {
    chrome.tabs?.sendMessage?.(activeTab.id, { type: MESSAGE_TYPES.TOGGLE_DRAWER }, () => {
      void chrome.runtime?.lastError;
      window.close?.();
    });
  } else {
    window.close?.();
  }
}

function onCollectionRowClick() {
  const category = activeTab && activeTab.url ? classifyUrl(activeTab.url) : null;
  if (activeTab && activeTab.id != null && category === 'collection') {
    if (!chrome.tabs?.sendMessage) {
      if (chrome.tabs?.update) chrome.tabs.update(activeTab.id, { active: true });
      window.close?.();
      return;
    }
    chrome.tabs.sendMessage(
      activeTab.id,
      { type: MESSAGE_TYPES.FOCUS_COLLECTION_PANEL },
      (response) => {
        void chrome.runtime?.lastError;
        if (response && response.ok === true) {
          window.close?.();
        } else {
          if (chrome.tabs?.update) chrome.tabs.update(activeTab.id, { active: true });
          window.close?.();
        }
      }
    );
  } else {
    if (chrome.tabs?.create) chrome.tabs.create({ url: 'https://www.nexusmods.com/collections/' });
    window.close?.();
  }
}

const siteRow = document.getElementById('site-row');
if (siteRow) siteRow.addEventListener('click', onSiteRowClick);

const queueRow = document.getElementById('queue-row');
if (queueRow) queueRow.addEventListener('click', onQueueRowClick);

const collectionRow = document.getElementById('collection-row');
if (collectionRow) collectionRow.addEventListener('click', onCollectionRowClick);

const nowaitRow = document.getElementById('nowait-row');
if (nowaitRow) nowaitRow.addEventListener('click', () => toggleNowait());

const openSettingsBtn = document.getElementById('open-settings');
if (openSettingsBtn) {
  openSettingsBtn.addEventListener('click', () => {
    if (chrome.runtime?.openOptionsPage) chrome.runtime.openOptionsPage();
  });
}

const openDonateBtn = document.getElementById('open-donate');
if (openDonateBtn) {
  openDonateBtn.addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
      chrome.tabs.create({ url: DONATE_URL });
    } else if (typeof window !== 'undefined' && window.open) {
      window.open(DONATE_URL, '_blank', 'noopener,noreferrer');
    }
  });
}
if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage?.addListener) {
  chrome.runtime.onMessage.addListener((message) => {
    if (message && message.type === MESSAGE_TYPES.SETTINGS_CHANGED) {
      refresh();
    }
  });
}

if (typeof chrome !== 'undefined' && chrome.storage?.onChanged?.addListener) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes && (changes[STORAGE_KEY_SETTINGS] || changes[STORAGE_KEY_QUEUE])) {
      refresh();
    }
  });
}

refresh();
