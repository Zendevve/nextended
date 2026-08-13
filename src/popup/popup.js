import { MessageFactory, MESSAGE_TYPES } from '../shared/messages.js';
import { STORAGE_KEY_SETTINGS, STORAGE_KEY_STATS } from '../shared/constants.js';

function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      resolve(response || {});
    });
  });
}

async function refresh() {
  const [settingsRes, statsRes] = await Promise.all([
    sendMessage(MessageFactory.getSettings()),
    new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEY_STATS], (res) =>
        resolve(res[STORAGE_KEY_STATS] || {})
      );
    }),
  ]);

  const settings = settingsRes.result?.settings || settingsRes.settings || {};
  const site = document.getElementById('site-name');
  const archive = document.getElementById('archive-state');
  const dot = document.getElementById('status-dot');

  site.textContent =
    typeof chrome !== 'undefined' && chrome.runtime?.id ? 'Nexus Mods' : '—';

  const enabled = settings.enabled !== false;
  const handleArchive = settings.handleArchivedFiles !== false;
  archive.textContent = enabled && handleArchive ? 'On' : 'Off';
  dot.classList.toggle('inactive', !enabled);

  document.getElementById('downloads-count').textContent =
    statsRes.downloadsStarted || '0';
  document.getElementById('archive-count').textContent =
    statsRes.archiveFilesDetected || '0';
}

document.getElementById('open-settings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage && chrome.runtime.openOptionsPage();
});

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
setInterval(refresh, 5000);
