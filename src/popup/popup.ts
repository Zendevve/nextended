import { StorageManager } from '../common/storage';
import { CONFLICT_SCRIPT_LABELS } from '../common/types';

document.addEventListener('DOMContentLoaded', async () => {
  const config = await StorageManager.getConfig();

  const autoStart = document.querySelector('#autoStartDownload') as HTMLInputElement;
  const autoClose = document.querySelector('#autoCloseTab') as HTMLInputElement;
  const skipReq = document.querySelector('#skipRequirements') as HTMLInputElement;
  const handleArch = document.querySelector('#handleArchivedFiles') as HTMLInputElement;
  const externalDl = document.querySelector('#externalDownloaderEnabled') as HTMLInputElement;
  const openOptionsBtn = document.querySelector('#openOptionsBtn') as HTMLButtonElement;

  const statusIndicator = document.querySelector('#statusIndicator') as HTMLElement;
  const statusText = document.querySelector('#statusText') as HTMLElement;

  autoStart.checked = config.autoStartDownload;
  autoClose.checked = config.autoCloseTab;
  skipReq.checked = config.skipRequirements;
  handleArch.checked = config.handleArchivedFiles;
  externalDl.checked = config.externalDownloader.enabled;

  // Conflict badge: warn while a replaced userscript is detected and unacknowledged (issue #13)
  const conflictCard = document.querySelector('#conflictCard') as HTMLElement;
  const conflictText = document.querySelector('#conflictText') as HTMLElement;
  const conflictState = await StorageManager.getConflictState();
  if (conflictState.unacknowledged.length > 0) {
    const names = conflictState.unacknowledged.map((id) => CONFLICT_SCRIPT_LABELS[id]).join(', ');
    conflictText.textContent = `Replaced userscript still installed: ${names} — uninstall it, nextended replaces it.`;
    conflictCard.classList.remove('hidden');
  }

  const save = async (key: string, value: boolean) => {
    await StorageManager.setConfig({ [key]: value } as Record<string, boolean>);
    showSaved();
  };

  autoStart.addEventListener('change', () => save('autoStartDownload', autoStart.checked));
  autoClose.addEventListener('change', () => save('autoCloseTab', autoClose.checked));
  skipReq.addEventListener('change', () => save('skipRequirements', skipReq.checked));
  handleArch.addEventListener('change', () => save('handleArchivedFiles', handleArch.checked));
  externalDl.addEventListener('change', async () => {
    await StorageManager.setConfig({
      externalDownloader: { ...config.externalDownloader, enabled: externalDl.checked }
    });
    showSaved();
  });

  openOptionsBtn.addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open('../options/index.html');
    }
  });

  let savedTimer: number | undefined;
  function showSaved() {
    statusIndicator.classList.remove('idle');
    statusText.textContent = 'Settings synced';
    if (savedTimer) window.clearTimeout(savedTimer);
    savedTimer = window.setTimeout(() => {
      statusIndicator.classList.add('idle');
      statusText.textContent = 'Active on Nexus Mods';
    }, 1500);
  }
});
