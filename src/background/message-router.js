import { MESSAGE_TYPES } from '../shared/constants.js';
import {
  getSettings,
  setSettings,
  updateSettings,
  incrementStat,
  getStats,
} from '../storage/settings.js';
import { createLogger } from '../shared/logger.js';

const log = createLogger('router');

const handlers = new Map();

export function registerHandler(type, handler) {
  handlers.set(type, handler);
}

export async function dispatch(message, sender) {
  const { type, payload } = message || {};
  const handler = handlers.get(type);
  if (!handler) {
    log.debug('No handler for message', { type });
    return { error: `Unhandled message type: ${type}` };
  }
  try {
    const result = await handler(payload, sender);
    log.debug('Handled message', { type });
    return { success: true, result };
  } catch (e) {
    log.error('Handler failed', { type, error: e?.message, code: e?.code });
    return { success: false, error: e?.message, code: e?.code };
  }
}

registerHandler(MESSAGE_TYPES.GET_SETTINGS, async () => {
  return { settings: await getSettings() };
});

registerHandler(MESSAGE_TYPES.PING, async () => {
  return { alive: true, stats: await getStats() };
});

export { setSettings, updateSettings, incrementStat, getSettings };
