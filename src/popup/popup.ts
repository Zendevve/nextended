import { StorageManager } from '../common/storage';

document.addEventListener('DOMContentLoaded', async () => {
  const config = await StorageManager.getConfig();

  const autoStart = document.querySelector('#autoStartDownload') as HTMLInputElement;
  const autoClose = document.querySelector('#autoCloseTab') as HTMLInputElement;
  const skipReq = document.querySelector('#skipRequirements') as HTMLInputElement;
  const handleArch = document.querySelector('#handleArchivedFiles') as HTMLInputElement;
  const openOptionsBtn = document.querySelector('#openOptionsBtn') as HTMLButtonElement;

  const statusIndicator = document.querySelector('#statusIndicator') as HTMLElement;
  const statusText = document.querySelector('#statusText') as HTMLElement;

  autoStart.checked = config.autoStartDownload;
  autoClose.checked = config.autoCloseTab;
  skipReq.checked = config.skipRequirements;
  handleArch.checked = config.handleArchivedFiles;

  const save = async (key: string, value: boolean) => {
    await StorageManager.setConfig({ [key]: value } as Record<string, boolean>);
    showSaved();
  };

  autoStart.addEventListener('change', () => save('autoStartDownload', autoStart.checked));
  autoClose.addEventListener('change', () => save('autoCloseTab', autoClose.checked));
  skipReq.addEventListener('change', () => save('skipRequirements', skipReq.checked));
  handleArch.addEventListener('change', () => save('handleArchivedFiles', handleArch.checked));

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
