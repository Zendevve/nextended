import { beforeEach } from 'vitest';

window.__TEST_ENV__ = true;

globalThis.chrome = globalThis.chrome || {
  runtime: {
    onMessage: { addListener: () => () => {} },
    onInstalled: { addListener: () => () => {} },
    sendMessage: () => Promise.resolve(),
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
