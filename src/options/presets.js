import { PRESET_PROFILES } from '../shared/constants.js';

export const PRESETS = {
  [PRESET_PROFILES.SOLO_MODDER]: {
    name: 'Solo Modder (Speed)',
    description: 'Instant zero-delay downloads, auto-close download tabs, and skip warning prompts.',
    settings: {
      presetName: PRESET_PROFILES.SOLO_MODDER,
      enabled: true,
      autoStartDownload: true,
      autoCloseTab: true,
      closeTabDelay: 1500,
      skipRequirements: true,
      forceModManagerDownload: true,
      handleArchivedFiles: true,
      enableSearchCardButtons: true,
      enableRequirementsBundler: true,
      enableArchiveInspector: true,
      maxConcurrentDownloads: 2,
      organizeDownloads: true,
      downloadFolderTemplate: 'NexusMods/{game}/{mod_name}',
      generateMo2Meta: false,
    },
  },

  [PRESET_PROFILES.COLLECTION_HOARDER]: {
    name: 'Collection Hoarder (Bulk)',
    description: 'Maximized background queue throughput with 4 parallel download slots and resilient auto-retry.',
    settings: {
      presetName: PRESET_PROFILES.COLLECTION_HOARDER,
      enabled: true,
      handleCollections: true,
      collectionDownloadMethod: 1, // Browser Direct
      maxConcurrentDownloads: 4,
      collectionPauseBetweenDownload: 1.0,
      retryAttempts: 5,
      retryBackoffBaseMs: 1500,
      organizeDownloads: true,
      downloadFolderTemplate: 'NexusMods/{game}/Collections/{mod_name}',
      notifyOnQueueCompletion: true,
      enableRequirementsBundler: true,
    },
  },

  [PRESET_PROFILES.FREE_TIER]: {
    name: 'Cautious Free-Tier',
    description: 'Safe serial 1-at-a-time pacing to prevent triggering Cloudflare rate limits on free accounts.',
    settings: {
      presetName: PRESET_PROFILES.FREE_TIER,
      enabled: true,
      handleCollections: true,
      collectionDownloadMethod: 0, // NXM / Vortex
      maxConcurrentDownloads: 1,
      collectionPauseBetweenDownload: 3.0,
      retryAttempts: 3,
      retryBackoffBaseMs: 3000,
      skipRequirements: false,
      autoCloseTab: false,
      organizeDownloads: true,
      notifyOnQueueCompletion: true,
    },
  },

  [PRESET_PROFILES.MO2_POWER_USER]: {
    name: 'Mod Organizer 2 Power User',
    description: 'Direct NXM protocol dispatch, MO2 .meta metadata generation, and categorized staging.',
    settings: {
      presetName: PRESET_PROFILES.MO2_POWER_USER,
      enabled: true,
      forceModManagerDownload: true,
      handleArchivedFiles: true,
      collectionDownloadMethod: 0, // MO2 / NXM
      maxConcurrentDownloads: 3,
      generateMo2Meta: true,
      organizeDownloads: true,
      downloadFolderTemplate: 'NexusMods/{game}/downloads',
      enableRequirementsBundler: true,
    },
  },
};
