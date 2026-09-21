import { StorageManager } from '../common/storage';
import { DEFAULT_CONFIG } from '../common/config';
import { ExtensionConfig, ExternalDownloaderMode } from '../common/types';
import { SAFE_FLOOR } from '../content/modules/rateLimiter';

document.addEventListener('DOMContentLoaded', async () => {
  const autoStart = document.querySelector('#autoStartDownload') as HTMLInputElement;
  const autoClose = document.querySelector('#autoCloseTab') as HTMLInputElement;
  const closeDelay = document.querySelector('#closeTabDelayMs') as HTMLInputElement;
  const skipReq = document.querySelector('#skipRequirements') as HTMLInputElement;
  const vpnMode = document.querySelector('#vpnMode') as HTMLInputElement;
  const pageShieldEnabled = document.querySelector('#pageShieldEnabled') as HTMLInputElement;
  const dlSpeed = document.querySelector('#downloadSpeedMb') as HTMLInputElement;
  const pauseSec = document.querySelector('#pauseBetweenDownloadSec') as HTMLInputElement;
  const pauseFloorWarning = document.querySelector('#pauseFloorWarning') as HTMLElement;
  const handleArch = document.querySelector('#handleArchivedFiles') as HTMLInputElement;
  const extEnabled = document.querySelector('#externalDownloaderEnabled') as HTMLInputElement;
  const extMode = document.querySelector('#externalDownloaderMode') as HTMLSelectElement;
  const extRpcUrl = document.querySelector('#externalDownloaderRpcUrl') as HTMLInputElement;
  const extSecret = document.querySelector('#externalDownloaderSecret') as HTMLInputElement;

  const saveBtn = document.querySelector('#saveBtn') as HTMLButtonElement;
  const resetBtn = document.querySelector('#resetDefaultsBtn') as HTMLButtonElement;
  const toast = document.querySelector('#saveToast') as HTMLElement;

  let toastTimer: number | undefined;

  function showToast(message: string) {
    toast.textContent = message;
    toast.classList.remove('hidden');
    if (toastTimer) {
      window.clearTimeout(toastTimer);
    }
    toastTimer = window.setTimeout(() => toast.classList.add('hidden'), 2500);
  }

  function updatePauseFloorWarning() {
    const floorSec = SAFE_FLOOR.freeAccountExtraPauseSec;
    const configuredSec = Number.parseInt(pauseSec.value, 10);
    if (Number.isNaN(configuredSec) || configuredSec >= floorSec) {
      pauseFloorWarning.classList.add('hidden');
      return;
    }
    pauseFloorWarning.textContent =
      `Ban risk: ${configuredSec}s is below the ${floorSec}s Safe Floor for free accounts. ` +
      `The effective pause is raised to ${floorSec}s.`;
    pauseFloorWarning.classList.remove('hidden');
  }

  function populate(config: ExtensionConfig) {
    autoStart.checked = config.autoStartDownload;
    autoClose.checked = config.autoCloseTab;
    closeDelay.value = config.closeTabDelayMs.toString();
    skipReq.checked = config.skipRequirements;
    vpnMode.checked = config.vpnMode;
    pageShieldEnabled.checked = config.pageShieldEnabled;
    dlSpeed.value = config.downloadSpeedMb.toString();
    pauseSec.value = config.pauseBetweenDownloadSec.toString();
    handleArch.checked = config.handleArchivedFiles;
    extEnabled.checked = config.externalDownloader.enabled;
    extMode.value = config.externalDownloader.mode;
    extRpcUrl.value = config.externalDownloader.rpcUrl;
    extSecret.value = config.externalDownloader.secret;
    updatePauseFloorWarning();
  }

  function collectConfig(): Partial<ExtensionConfig> {
    extRpcUrl.value = extRpcUrl.value.trim();
    extSecret.value = extSecret.value.trim();
    return {
      autoStartDownload: autoStart.checked,
      autoCloseTab: autoClose.checked,
      closeTabDelayMs: Number.parseInt(closeDelay.value, 10) || 2000,
      skipRequirements: skipReq.checked,
      vpnMode: vpnMode.checked,
      pageShieldEnabled: pageShieldEnabled.checked,
      downloadSpeedMb: Number.parseFloat(dlSpeed.value) || 1.5,
      pauseBetweenDownloadSec: Number.parseInt(pauseSec.value, 10) || 5,
      handleArchivedFiles: handleArch.checked,
      externalDownloader: {
        enabled: extEnabled.checked,
        mode: extMode.value as ExternalDownloaderMode,
        rpcUrl: extRpcUrl.value || 'http://localhost:6800/jsonrpc',
        secret: extSecret.value
      }
    };
  }

  const initialConfig = await StorageManager.getConfig();
  populate(initialConfig);

  let saveDebounce: number | undefined;
  const debounceSave = () => {
    if (saveDebounce) {
      window.clearTimeout(saveDebounce);
    }
    saveDebounce = window.setTimeout(async () => {
      await StorageManager.setConfig(collectConfig());
      showToast('Settings saved automatically');
    }, 400);
  };

  [
    autoStart,
    autoClose,
    closeDelay,
    skipReq,
    vpnMode,
    pageShieldEnabled,
    dlSpeed,
    pauseSec,
    handleArch,
    extEnabled,
    extMode,
    extRpcUrl,
    extSecret
  ].forEach((el) => {
    const event = el.type === 'checkbox' ? 'change' : 'input';
    el.addEventListener(event, debounceSave);
  });

  pauseSec.addEventListener('input', updatePauseFloorWarning);

  saveBtn.addEventListener('click', async () => {
    if (saveDebounce) {
      window.clearTimeout(saveDebounce);
      saveDebounce = undefined;
    }
    await StorageManager.setConfig(collectConfig());
    showToast('Settings saved!');
  });

  resetBtn.addEventListener('click', async () => {
    if (confirm('Reset all settings to default values?')) {
      if (saveDebounce) {
        window.clearTimeout(saveDebounce);
        saveDebounce = undefined;
      }
      await StorageManager.setConfig(DEFAULT_CONFIG);
      populate(DEFAULT_CONFIG);
      showToast('Settings reset to defaults!');
    }
  });
});
