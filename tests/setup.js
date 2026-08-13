import { beforeEach } from 'vitest';

window.__TEST_ENV__ = true;

globalThis.chrome = globalThis.chrome || {
  runtime: {
    id: 'test-extension-id',
    onMessage: { addListener: () => () => {} },
    onInstalled: { addListener: () => () => {} },
    sendMessage: (message, cb) => {
      const response = { success: true, result: {} };
      if (typeof cb === 'function') cb(response);
      return Promise.resolve(response);
    },
  },
  storage: {
    local: {
      get: () => Promise.resolve({}),
      set: () => Promise.resolve(),
      remove: () => Promise.resolve(),
      clear: () => Promise.resolve(),
    },
  },
  downloads: {
    download: () => Promise.resolve(),
    onCreated: { addListener: () => () => {} },
  },
  i18n: { getMessage: (k) => k },
  tabs: { query: (_q, cb) => cb && cb([]), sendMessage: () => {} },
};

beforeEach(() => {
  if (typeof document !== 'undefined') {
    const html = document.documentElement;
    html.innerHTML = '';
    const body = document.createElement('body');
    html.appendChild(body);
  }
  for (const key of [
    'g_GameID',
    'g_gameid',
    'gGameID',
    'g_game_id',
    'gameID',
    'gameId',
  ]) {
    try {
      delete globalThis[key];
    } catch {
      globalThis[key] = undefined;
    }
  }
});
