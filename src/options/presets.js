import { PRESET_PROFILES } from '../shared/constants.js';

export const PRESETS = {
  [PRESET_PROFILES.SOLO_MODDER]: {
    name: 'Solo Modder (Speed)',
    description: 'Instant zero-delay downloads, auto-close download tabs, and skip requirements popup.',
    settings: {
      presetName: PRESET_PROFILES.SOLO_MODDER,
      enabled: true,
      autoStartDownload: true,
      autoCloseTab: true,
      closeTabDelay: 1500,
      skipRequirements: true,
      forceModManagerDownload: true,
      handleArchivedFiles: true,
      downloadButtonColor: true,
    },
  },

  [PRESET_PROFILES.COLLECTION_HOARDER]: {
    name: 'Collection Hoarder (Bulk)',
    description: 'Maximized collection download throughput with fast pacing.',
    settings: {
      presetName: PRESET_PROFILES.COLLECTION_HOARDER,
      enabled: true,
      handleCollections: true,
      collectionDownloadMethod: 1, // Browser Direct
      collectionPauseBetweenDownload: 1.0,
      collectionSafetyPause: true,
      autoStartDownload: true,
      skipRequirements: true,
      downloadButtonColor: true,
    },
  },

  [PRESET_PROFILES.FREE_TIER]: {
    name: 'Cautious Free-Tier',
    description: 'Safe pacing to prevent triggering Nexus rate limits on free accounts.',
    settings: {
      presetName: PRESET_PROFILES.FREE_TIER,
      enabled: true,
      handleCollections: true,
      collectionDownloadMethod: 0, // NXM / Vortex
      collectionPauseBetweenDownload: 5.0,
      collectionSafetyPause: true,
      skipRequirements: true,
      autoCloseTab: false,
      downloadButtonColor: true,
    },
  },

  [PRESET_PROFILES.MO2_POWER_USER]: {
    name: 'Mod Organizer 2 Power User',
    description: 'Direct NXM protocol dispatch and forced Mod Manager buttons for all files.',
    settings: {
      presetName: PRESET_PROFILES.MO2_POWER_USER,
      enabled: true,
      forceModManagerDownload: true,
      handleArchivedFiles: true,
      collectionDownloadMethod: 0, // MO2 / NXM
      skipRequirements: true,
      autoStartDownload: true,
      downloadButtonColor: true,
    },
  },
};
