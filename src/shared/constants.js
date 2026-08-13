export const EXTENSION_NAME = 'Nexus Mods Download Tools';
export const EXTENSION_ID = 'nexus-download-tools';
export const LOG_PREFIX = '[NXDT]';

export const STORAGE_KEY_SETTINGS = 'settings';
export const STORAGE_KEY_STATS = 'stats';
export const STORAGE_KEY_DIAGNOSTICS = 'diagnostics';
export const STORAGE_KEY_COLLECTION_HISTORY = 'collection_history';

export const NEXUS_HOSTS = ['nexusmods.com', 'www.nexusmods.com'];
export const CDN_HOSTS = ['nexus-cdn.com', 'files.nexus-cdn.com'];
export const GRAPHQL_HOSTS = ['api-router.nexusmods.com'];

export const URL_SCHEME_HTTPS = 'https:';

export const DOWNLOAD_METHOD_VORTEX = 0;
export const DOWNLOAD_METHOD_BROWSER = 1;

export const MESSAGE_TYPES = {
  PING: 'NXDT_PING',
  GET_SETTINGS: 'NXDT_GET_SETTINGS',
  SETTINGS_CHANGED: 'NXDT_SETTINGS_CHANGED',
  FETCH_COLLECTION_REVISIONS: 'NXDT_FETCH_COLLECTION_REVISIONS',
  FETCH_COLLECTION_MODS: 'NXDT_FETCH_COLLECTION_MODS',
  GET_COLLECTION_HISTORY: 'NXDT_GET_COLLECTION_HISTORY',
  SET_COLLECTION_HISTORY: 'NXDT_SET_COLLECTION_HISTORY',
  START_DOWNLOAD: 'NXDT_START_DOWNLOAD',
  RESOLVE_COLLECTION_DOWNLOAD: 'NXDT_RESOLVE_COLLECTION_DOWNLOAD',
};

export const LOG_LEVELS = {
  DEBUG: 10,
  INFO: 20,
  WARN: 30,
  ERROR: 40,
};
