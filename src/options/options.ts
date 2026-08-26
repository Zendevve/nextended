import { StorageManager } from '../common/storage';
import { DEFAULT_CONFIG } from '../common/config';
import { ExtensionConfig } from '../common/types';

document.addEventListener('DOMContentLoaded', async () => {
  const autoStart = document.querySelector('#autoStartDownload') as HTMLInputElement;
  const autoClose = document.querySelector('#autoCloseTab') as HTMLInputElement;
  const closeDelay = document.querySelector('#closeTabDelayMs') as HTMLInputElement;
  const skipReq = document.querySelector('#skipRequirements') as HTMLInputElement;
  const vpnMode = document.querySelector('#vpnMode') as HTMLInputElement;
  const dlSpeed = document.querySelector('#downloadSpeedMb') as HTMLInputElement;
  const pauseSec = document.querySelector('#pauseBetweenDownloadSec') as HTMLInputElement;
  const handleArch = document.querySelector('#handleArchivedFiles') as HTMLInputElement;

  const saveBtn = document.querySelector('#saveBtn') as HTMLButtonElement;
  const resetBtn = document.querySelector('#resetDefaultsBtn') as HTMLButtonElement;
  const toast = document.querySelector('#saveToast') as HTMLElement;

  function populate(config: ExtensionConfig) {
    autoStart.checked = config.autoStartDownload;
    autoClose.checked = config.autoCloseTab;
    closeDelay.value = config.closeTabDelayMs.toString();
    skipReq.checked = config.skipRequirements;
    vpnMode.checked = config.vpnMode;
    dlSpeed.value = config.downloadSpeedMb.toString();
    pauseSec.value = config.pauseBetweenDownloadSec.toString();
    handleArch.checked = config.handleArchivedFiles;
  }

  const initialConfig = await StorageManager.getConfig();
  populate(initialConfig);

  saveBtn.addEventListener('click', async () => {
    const updated: Partial<ExtensionConfig> = {
      autoStartDownload: autoStart.checked,
      autoCloseTab: autoClose.checked,
      closeTabDelayMs: Number.parseInt(closeDelay.value, 10) || 2000,
      skipRequirements: skipReq.checked,
      vpnMode: vpnMode.checked,
      downloadSpeedMb: Number.parseFloat(dlSpeed.value) || 1.5,
      pauseBetweenDownloadSec: Number.parseInt(pauseSec.value, 10) || 5,
      handleArchivedFiles: handleArch.checked
    };

    await StorageManager.setConfig(updated);
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 2500);
  });

  resetBtn.addEventListener('click', async () => {
    if (confirm('Reset all settings to default values?')) {
      await StorageManager.setConfig(DEFAULT_CONFIG);
      populate(DEFAULT_CONFIG);
      toast.textContent = 'Settings reset to defaults!';
      toast.classList.remove('hidden');
      setTimeout(() => toast.classList.add('hidden'), 2500);
    }
  });
});
