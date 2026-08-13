import { MESSAGE_TYPES } from '../shared/constants.js';

export { MESSAGE_TYPES };

export function createMessage(type, payload) {
  return { type, payload: payload || {} };
}

export function resolveMessage(type, payload) {
  return { type, payload: payload || {} };
}

export const MessageFactory = {
  ping: () => createMessage(MESSAGE_TYPES.PING),
  getSettings: () => createMessage(MESSAGE_TYPES.GET_SETTINGS),
  settingsChanged: (settings) =>
    createMessage(MESSAGE_TYPES.SETTINGS_CHANGED, { settings }),
  resolveDownload: (fileId, gameId, mode, slug) =>
    createMessage(MESSAGE_TYPES.RESOLVE_DOWNLOAD, { fileId, gameId, mode, slug }),
  downloadResolved: (fileId, url) =>
    createMessage(MESSAGE_TYPES.DOWNLOAD_RESOLVED, { fileId, url }),
  downloadError: (fileId, code, message) =>
    createMessage(MESSAGE_TYPES.DOWNLOAD_ERROR, { fileId, code, message }),
  startDownload: (url, filename) =>
    createMessage(MESSAGE_TYPES.START_DOWNLOAD, { url, filename }),
  openUrl: (url) => createMessage(MESSAGE_TYPES.OPEN_URL, { url }),
  log: (level, message, context) =>
    createMessage(MESSAGE_TYPES.LOG, { level, message, context }),
};
