export const DEFAULT_SETTINGS = {
  enabled: true,
  handleCollections: true,
  collectionDownloadMethod: 0,
  collectionDownloadSpeed: 1.5,
  collectionPauseBetweenDownload: 5,
  collectionAutoSkipDownloaded: false,
  collectionSafetyPause: true,
  autoStartDownload: true,
  autoCloseTab: false,
  closeTabDelay: 2000,
  skipRequirements: true,
  forceModManagerDownload: true,
  handleArchivedFiles: true,
  downloadButtonColor: true,
  vpnMode: false,
  debugLogging: false,
  requestTimeout: 30000,
  presetName: 'custom',
};

export const DEFAULT_STATS = {
  collectionsDownloaded: 0,
  autoDownloadsCompleted: 0,
};

export const STORAGE_VERSION = 2;
