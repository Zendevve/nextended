import type { CollectionModFile } from '../src/common/types';

// Deterministic seedable RNG (mulberry32) — fixed seeds, no live network, no time-of-day.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildMod(
  modId: number,
  fileId: number,
  version: number,
  domain: string = 'skyrim',
): CollectionModFile {
  return {
    fileId,
    optional: modId % 3 === 0,
    file: {
      fileId,
      name: `Mod_${modId}_File_${fileId}_v${version}`,
      uri: `Mod_${modId}-${fileId}-v${version}.zip`,
      size: 512 + ((modId * 7919 + fileId * 13 + version) % 65536),
      version: `1.${version}.0`,
      date: 1_700_000_000 + modId * 1000 + fileId,
      mod: {
        modId,
        name: `Mod ${modId}`,
        version: `1.${version}.0`,
        adult: false,
        game: { id: 110, domainName: domain },
      },
    },
  };
}

/** Deterministic collection of N mods. */
export function buildCollection(count: number, seed: number): CollectionModFile[] {
  const rand = mulberry32(seed);
  const mods: CollectionModFile[] = [];
  for (let i = 0; i < count; i++) {
    const modId = 1 + i;
    const fileId = 1000 + i;
    const version = Math.floor(rand() * 4);
    mods.push(buildMod(modId, fileId, version));
  }
  return mods;
}

/** Deterministic mutated revision: ~10% added, ~10% version-bumped, ~5% removed. */
export function buildNextRevision(current: CollectionModFile[], seed: number): CollectionModFile[] {
  const rand = mulberry32(seed);
  const next: CollectionModFile[] = [];
  let maxMod = current.length;
  for (const m of current) {
    const r = rand();
    if (r < 0.05) continue; // removed
    const copy: CollectionModFile = JSON.parse(JSON.stringify(m)) as CollectionModFile;
    if (r < 0.15) {
      const parts = copy.file.version.split('.');
      copy.file.version = `1.${parseInt(parts[1], 10) + 1}.0`;
      copy.file.mod.version = copy.file.version;
    }
    next.push(copy);
  }
  const additions = Math.floor(current.length * 0.1);
  for (let i = 0; i < additions; i++) {
    maxMod += 1;
    next.push(buildMod(maxMod, 100000 + i, 0));
  }
  return next;
}

/** Deterministic local file list: exact names for a fraction + noise. */
export function buildLocalFiles(
  mods: CollectionModFile[],
  seed: number,
  matchFraction = 0.3,
): File[] {
  const rand = mulberry32(seed);
  const names: string[] = [];
  const matched = Math.floor(mods.length * matchFraction);
  for (let i = 0; i < matched; i++) {
    names.push(mods[Math.floor(rand() * mods.length)].file.uri);
  }
  const noise = Math.floor(mods.length * 0.1);
  for (let i = 0; i < noise; i++) {
    names.push(`unrelated-file-${Math.floor(rand() * 1e9)}.zip`);
  }
  return names.map((n) => new File([''], n));
}

const ROUTE_PATHS = [
  '/skyrim/collections/abc123',
  '/games/skyrim/collections/abc123',
  '/skyrim/collections/abc123/revisions/112',
  '/stardewvalley/collections/bbubvs',
  '/cyberpunk2077/collections/xyz789/mods',
  '/fallout4/mods/12345?tab=files&file_id=67890',
  '/skyrim/mods/49397',
  '/games/stardewvalley/collections/bbubvs/revisions/5',
  '/not/a/collection/page',
  '/skyrim/collections/',
];

export function buildRouteBatch(count: number, seed: number): string[] {
  const rand = mulberry32(seed);
  const batch: string[] = new Array(count);
  for (let i = 0; i < count; i++) {
    batch[i] = ROUTE_PATHS[Math.floor(rand() * ROUTE_PATHS.length)];
  }
  return batch;
}

// ---- deterministic href corpus for extractFileId / isNMMDownload paths ----

const HREFS = [
  'https://www.nexusmods.com/skyrim/mods/100?tab=files&file_id=2000',
  'nxm://skyrim/mods/100/files/200?key=abcdef&expires=1700000000&user_id=1',
  'https://www.nexusmods.com/Core/Libs/Common/Managers/Downloads?GenerateDownloadUrl&id=3000&game_id=110',
  '/skyrim/mods/100?tab=files&file_id=4000&nmm=1',
  'https://www.nexusmods.com/skyrim/mods/100/files/5000',
  'https://example.com/not-a-download',
  '',
];

export const NMM_HREFS = [
  'nxm://skyrim/mods/100/files/200?key=k&expires=1',
  'https://www.nexusmods.com/skyrim/mods/100?tab=files&file_id=1&nmm=1',
  'https://www.nexusmods.com/skyrim/mods/100',
];

export const PLAIN_HREFS = [
  'https://www.nexusmods.com/skyrim/mods/100?tab=files&file_id=2',
  'https://www.nexusmods.com/skyrim/mods/100',
  'https://example.com/x',
];

export function buildHrefBatch(count: number, seed: number): string[] {
  const rand = mulberry32(seed);
  const batch: string[] = new Array(count);
  for (let i = 0; i < count; i++) batch[i] = HREFS[Math.floor(rand() * HREFS.length)];
  return batch;
}

const RESPONSE_TEXTS = [
  JSON.stringify({ url: 'https://files.nexus-cdn.com/123/mod.zip?key=abc&expires=999' }),
  '<div><input id="dl_link" value="https://files.nexus-cdn.com/456/mod.zip&key=xyz" /></div>',
  'nxm://skyrim/mods/1000/files/200?key=abcdef&expires=1700000000&user_id=12345',
  '<html><head><title>Just a moment...</title></head><body>cf-turnstile challenge-form</body></html>',
  'Normal HTML page with no download info at all, just some text content here.',
  '<a id="slowDownloadButton" data-download-url="https://files.nexus-cdn.com/x/mod.zip?key=k&expires=1">Slow</a>',
  JSON.stringify([
    { downloadUrl: 'https://files.nexus-cdn.com/a.zip?key=1&expires=2' },
    { url: 'https://files.nexus-cdn.com/b.zip?key=3&expires=4' },
  ]),
  '<input value="https://files.nexus-cdn.com/c/mod.zip?key=q" id="dl_link" />',
];

export function buildResponseBatch(count: number, seed: number): string[] {
  const rand = mulberry32(seed);
  const batch: string[] = new Array(count);
  for (let i = 0; i < count; i++) batch[i] = RESPONSE_TEXTS[Math.floor(rand() * RESPONSE_TEXTS.length)];
  return batch;
}
