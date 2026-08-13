import { describe, it, expect } from 'vitest';
import {
  extractGameSlug,
  extractModId,
  extractGameId,
  extractGameInfo,
} from '../src/nexus/game-parser.js';

describe('game-parser', () => {
  it('extracts slug from pathname', () => {
    expect(extractGameSlug({ pathname: '/skyrimspecialedition/mods/42' })).toBe(
      'skyrimspecialedition'
    );
    expect(extractGameSlug({ pathname: '/' })).toBeNull();
  });

  it('extracts mod id from path', () => {
    expect(extractModId({ pathname: '/skyrimspecialedition/mods/42' })).toBe('42');
    expect(extractModId({ pathname: '/other/mods/99/files' })).toBe('99');
    expect(extractModId({ pathname: '/no/mods' })).toBeNull();
  });

  it('extracts gameId from body data-gameid', () => {
    document.body.innerHTML = '';
    document.body.setAttribute('data-gameid', '1704');
    expect(extractGameId(document, { pathname: '/x' })).toBe('1704');
  });

  it('extracts gameId from g_GameID global', () => {
    window.g_GameID = '1008';
    expect(extractGameId(document, { pathname: '/x' })).toBe('1008');
    delete window.g_GameID;
  });

  it('extracts gameId from script content', () => {
    document.body.innerHTML = '<script>var g_GameID = 1704;</script>';
    expect(extractGameId(document, { pathname: '/x' })).toBe('1704');
  });

  it('extracts gameId from search params', () => {
    expect(extractGameId(document, { pathname: '/x', search: '?game_id=1704' })).toBe(
      '1704'
    );
  });

  it('falls back to 0 when unknown', () => {
    document.body.innerHTML = '';
    const doc = document.implementation.createHTMLDocument('');
    expect(extractGameId(doc, { pathname: '/x' })).toBe('0');
  });

  it('extracts full game info', () => {
    document.body.innerHTML = '<script>var g_GameID = 1704;</script>';
    const info = extractGameInfo(document, {
      pathname: '/skyrimspecialedition/mods/42',
      search: '',
    });
    expect(info.gameId).toBe('1704');
    expect(info.gameSlug).toBe('skyrimspecialedition');
    expect(info.modId).toBe('42');
  });
});
