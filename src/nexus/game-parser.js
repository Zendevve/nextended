import { extractSlugFromPathname } from './url-utils.js';

export function extractGameSlug(location) {
  if (!location) return null;
  const pathname = location.pathname || (typeof location === 'string' ? location : '');
  return extractSlugFromPathname(pathname);
}

export function extractModId(location) {
  if (!location) return null;
  const pathname = location.pathname || '';
  const parts = pathname.split('/').filter(Boolean);
  const idx = parts.indexOf('mods');
  if (idx !== -1 && parts[idx + 1]) return parts[idx + 1];
  const m = pathname.match(/\/mods\/(\d+)/);
  return m ? m[1] : null;
}

export function extractGameId(document, location) {
  const doc =
    document || (typeof globalThis.document !== 'undefined' ? globalThis.document : null);
  const win = typeof globalThis.window !== 'undefined' ? globalThis.window : null;

  if (doc && doc.body) {
    const bodyId = doc.body.getAttribute && doc.body.getAttribute('data-gameid');
    if (bodyId && /^\d+$/.test(String(bodyId))) return String(bodyId);
  }

  if (win) {
    const candidates = [
      'g_GameID',
      'g_gameid',
      'gGameID',
      'g_game_id',
      'gameID',
      'gameId',
    ];
    for (const key of candidates) {
      const v = win[key];
      if (v !== undefined && v !== null && /^\d+$/.test(String(v))) return String(v);
    }
  }

  if (doc && doc.scripts) {
    const scripts = doc.scripts;
    for (let i = 0; i < scripts.length; i++) {
      const text = scripts[i].textContent || '';
      const m =
        text.match(/g_GameID\s*[:=]\s*["']?(\d+)/) || text.match(/"GameID"\s*:\s*(\d+)/);
      if (m) return m[1];
    }
  }

  if (location && location.search) {
    const params = new URLSearchParams(location.search);
    const gid = params.get('game_id') || params.get('gid') || params.get('gameId');
    if (gid && /^\d+$/.test(gid)) return gid;
  }

  return '0';
}

export function extractGameInfo(document, location) {
  const gameId = extractGameId(document, location);
  const gameSlug = extractGameSlug(location);
  const modId = extractModId(location);
  return { gameId, gameSlug, modId };
}
