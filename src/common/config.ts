import { ExtensionConfig, DownloadMethod } from './types';

export const DEFAULT_CONFIG: ExtensionConfig = {
  autoStartDownload: true,
  autoCloseTab: true,
  closeTabDelayMs: 2000,
  skipRequirements: true,
  forceModManagerDownload: false,
  handleArchivedFiles: true,
  downloadButtonColor: false,
  overrideFileNames: false,
  vpnMode: false,
  showAlertsOnError: true,
  playErrorSound: true,
  requestTimeoutMs: 30000,
  downloadSpeedMb: 1.5,
  pauseBetweenDownloadSec: 5,
  downloadMethod: DownloadMethod.VORTEX
};
