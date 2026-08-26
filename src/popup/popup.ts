import { StorageManager } from '../common/storage';

document.addEventListener('DOMContentLoaded', async () => {
  const config = await StorageManager.getConfig();

  const autoStart = document.querySelector('#autoStartDownload') as HTMLInputElement;
  const autoClose = document.querySelector('#autoCloseTab') as HTMLInputElement;
  const skipReq = document.querySelector('#skipRequirements') as HTMLInputElement;
  const handleArch = document.querySelector('#handleArchivedFiles') as HTMLInputElement;
  const openOptionsBtn = document.querySelector('#openOptionsBtn') as HTMLButtonElement;

  autoStart.checked = config.autoStartDownload;
  autoClose.checked = config.autoCloseTab;
  skipReq.checked = config.skipRequirements;
  handleArch.checked = config.handleArchivedFiles;

  autoStart.addEventListener('change', () => StorageManager.setConfig({ autoStartDownload: autoStart.checked }));
  autoClose.addEventListener('change', () => StorageManager.setConfig({ autoCloseTab: autoClose.checked }));
  skipReq.addEventListener('change', () => StorageManager.setConfig({ skipRequirements: skipReq.checked }));
  handleArch.addEventListener('change', () => StorageManager.setConfig({ handleArchivedFiles: handleArch.checked }));

  openOptionsBtn.addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open('../options/index.html');
    }
  });
});
