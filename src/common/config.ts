import { ExtensionConfig, DownloadMethod, ExternalDownloaderMode } from './types';

export const DEFAULT_CONFIG: ExtensionConfig = {
  autoStartDownload: true,
  autoCloseTab: true,
  closeTabDelayMs: 2000,
  skipRequirements: true,
  forceModManagerDownload: false,
  handleArchivedFiles: true,
  overrideFileNames: false,
  vpnMode: false,
  showAlertsOnError: true,
  pageShieldEnabled: true,
  requestTimeoutMs: 30000,
  downloadSpeedMb: 1.5,
  pauseBetweenDownloadSec: 5,
  downloadMethod: DownloadMethod.BROWSER,
  externalDownloader: {
    enabled: false,
    mode: ExternalDownloaderMode.CLIPBOARD,
    rpcUrl: 'http://localhost:6800/jsonrpc',
    secret: ''
  }
};
