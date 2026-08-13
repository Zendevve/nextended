export const EXTENSION_NAME = 'Nexus Mods Download Tools';
export const EXTENSION_ID = 'nexus-download-tools';
export const LOG_PREFIX = '[NXDT]';

export const STORAGE_KEY_SETTINGS = 'settings';
export const STORAGE_KEY_STATS = 'stats';
export const STORAGE_KEY_DIAGNOSTICS = 'diagnostics';

export const GAME_ID_UNKNOWN = '0';

export const NEXUS_HOSTS = ['nexusmods.com', 'www.nexusmods.com'];
export const CDN_HOSTS = ['nexus-cdn.com', 'files.nexus-cdn.com'];

export const URL_SCHEME_HTTPS = 'https:';

export const ARCHIVE_QUERY_KEY = 'category';
export const ARCHIVE_QUERY_VALUE = 'archived';

export const MODE_MANUAL = 'manual';
export const MODE_MANAGER = 'manager';
export const MODES = [MODE_MANAGER, MODE_MANUAL];

export const MESSAGE_TYPES = {
  PING: 'NXDT_PING',
  GET_SETTINGS: 'NXDT_GET_SETTINGS',
  SETTINGS_CHANGED: 'NXDT_SETTINGS_CHANGED',
  RESOLVE_DOWNLOAD: 'NXDT_RESOLVE_DOWNLOAD',
  DOWNLOAD_RESOLVED: 'NXDT_DOWNLOAD_RESOLVED',
  DOWNLOAD_ERROR: 'NXDT_DOWNLOAD_ERROR',
  START_DOWNLOAD: 'NXDT_START_DOWNLOAD',
  OPEN_URL: 'NXDT_OPEN_URL',
  LOG: 'NXDT_LOG',
};

export const BUTTON_DATA_ATTR = 'data-nxdt';
export const BUTTON_FILE_ID_ATTR = 'data-nxdt-file-id';
export const BUTTON_MODE_ATTR = 'data-nxdt-mode';
export const BUTTON_STATE_ATTR = 'data-nxdt-state';

export const BUTTON_STATES = {
  READY: 'ready',
  RESOLVING: 'resolving',
  DOWNLOADING: 'downloading',
  SUCCESS: 'success',
  ERROR: 'error',
};

export const LOG_LEVELS = {
  DEBUG: 10,
  INFO: 20,
  WARN: 30,
  ERROR: 40,
};
