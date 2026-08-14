export const DEFAULT_SETTINGS = {
  enabled: true,
  handleCollections: true,
  collectionDownloadMethod: 0,
  collectionDownloadSpeed: 1.5,
  collectionPauseBetweenDownload: 1.5,
  autoStartDownload: true,
  autoCloseTab: false,
  skipRequirements: true,
  forceModManagerDownload: true,
  handleArchivedFiles: true,
  closeTabDelay: 2000,
  debugLogging: false,
  requestTimeout: 30000,

  // Concurrency & Resilience
  maxConcurrentDownloads: 2,
  retryAttempts: 3,
  retryBackoffBaseMs: 2000,

  // In-Page Ergonomics
  enableSearchCardButtons: true,
  enableRequirementsBundler: true,
  enableArchiveInspector: true,

  // File Organization & Mod Manager
  organizeDownloads: true,
  downloadFolderTemplate: 'NexusMods/{game}/{mod_name}',
  generateMo2Meta: false,

  // Notifications & Presets
  notifyOnQueueCompletion: true,
  presetName: 'custom',
};

export const DEFAULT_STATS = {
  collectionsDownloaded: 0,
  autoDownloadsCompleted: 0,
  queueItemsDownloaded: 0,
  requirementsBundlesQueued: 0,
};

export const DEFAULT_QUEUE_STATE = {
  status: 'idle',
  items: [],
  activeCount: 0,
  completedCount: 0,
  failedCount: 0,
  totalBytes: 0,
  downloadedBytes: 0,
  currentSpeedBytesPerSec: 0,
  lastUpdated: 0,
};

export const STORAGE_VERSION = 2;
