export const DEFAULT_SETTINGS = {
  enabled: true,
  handleArchivedFiles: true,
  manualDownloads: true,
  modManagerDownloads: true,
  skipRequirements: false,
  automaticDownloads: false,
  debugLogging: false,
  requestTimeout: 30000,
  cloudflareFallback: 'browser',
  showErrorNotifications: true,
};

export const DEFAULT_STATS = {
  downloadsStarted: 0,
  downloadErrors: 0,
  archiveFilesDetected: 0,
};

export const STORAGE_VERSION = 1;
