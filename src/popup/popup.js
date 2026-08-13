import { MessageFactory, MESSAGE_TYPES } from '../shared/messages.js';
import { STORAGE_KEY_SETTINGS } from '../shared/constants.js';

function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      resolve(response || {});
    });
  });
}

async function refresh() {
  const [pingRes, settingsRes] = await Promise.all([
    sendMessage(MessageFactory.ping()),
    sendMessage(MessageFactory.getSettings()),
  ]);

  const result = pingRes.result || {};
  const alive = result.alive === true;
  const stats = result.stats || {};

  const settings = settingsRes.result?.settings || settingsRes.settings || {};
  const site = document.getElementById('site-name');
  const collectionState = document.getElementById('collection-state');
  const nowaitState = document.getElementById('nowait-state');
  const dot = document.getElementById('status-dot');

  site.textContent =
    typeof chrome !== 'undefined' && chrome.runtime?.id ? 'Nexus Mods' : '—';

  const enabled = settings.enabled !== false;
  const handleCollections = settings.handleCollections !== false;
  const autoStart = settings.autoStartDownload !== false;

  if (collectionState) {
    collectionState.textContent = enabled && handleCollections ? 'On' : 'Off';
  }
  if (nowaitState) {
    nowaitState.textContent = enabled && autoStart ? 'On' : 'Off';
  }
  if (dot) {
    dot.classList.toggle('inactive', !enabled || !alive);
  }

  const collectionsCount = document.getElementById('collections-count');
  if (collectionsCount) {
    collectionsCount.textContent = stats.collectionsDownloaded || '0';
  }
}

const openSettingsBtn = document.getElementById('open-settings');
if (openSettingsBtn) {
  openSettingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage && chrome.runtime.openOptionsPage();
  });
}

if (chrome && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message) => {
    if (message && message.type === MESSAGE_TYPES.SETTINGS_CHANGED) {
      refresh();
    }
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STORAGE_KEY_SETTINGS]) {
    refresh();
  }
});

refresh();
