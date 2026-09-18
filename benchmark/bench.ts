import { RevisionDiffer } from '../src/content/modules/collections/utils/revisionDiffer';
import { FileMatcher } from '../src/content/modules/collections/utils/fileMatcher';
import { RateLimiter } from '../src/content/modules/rateLimiter';
import { SingleDownloader } from '../src/content/modules/singleDownloader';
import { ClickInterceptor } from '../src/content/interceptors/clickInterceptor';
import { extractCollectionRouteDetails } from '../src/content/index';
import {
  buildCollection,
  buildNextRevision,
  buildLocalFiles,
  buildRouteBatch,
  buildHrefBatch,
  buildResponseBatch,
  NMM_HREFS,
  PLAIN_HREFS,
} from './fixtures';

// Workload: representative UX hot paths (download click resolution, collection
// diff/match, route parsing). All inputs deterministic (fixed seeds); no network,
// no clock reads inside the workload. Timing only via performance.now().
const MOD_COUNT = 1200;
const HREF_COUNT = 1500;
const RESPONSE_COUNT = 1500;
const ROUTE_COUNT = 3000;
const PAUSE_COUNT = 5000;
const ITERATIONS = 20;
const WARMUP = 3;

const current = buildCollection(MOD_COUNT, 42);
const next = buildNextRevision(current, 1337);
const localFiles = buildLocalFiles(current, 7);
const hrefs = buildHrefBatch(HREF_COUNT, 99);
const responses = buildResponseBatch(RESPONSE_COUNT, 1234);
const routes = buildRouteBatch(ROUTE_COUNT, 555);

function runOnce(): {
  revision: number;
  match: number;
  parse: number;
  click: number;
  route: number;
  pause: number;
  checksum: number;
} {
  let checksum = 0;

  let t0 = performance.now();
  const diff = RevisionDiffer.diff(current, next);
  const revision = performance.now() - t0;
  checksum += diff.added.length * 3 + diff.updated.length * 5 + diff.removed.length * 7;

  t0 = performance.now();
  const matched = FileMatcher.matchFiles(localFiles, current);
  const match = performance.now() - t0;
  checksum += matched.matchedMods.length * 11 + matched.unmatchedFileNames.length * 13;

  t0 = performance.now();
  for (const text of responses) {
    const a = SingleDownloader.parseDownloadUrlFromResponse(text);
    const b = SingleDownloader.extractDirectDownloadFromText(text);
    const c = SingleDownloader.parseDownloadLink(text);
    const d = SingleDownloader.isCloudflareChallenge(text);
    const e = SingleDownloader.isDirectDownloadUrl(text);
    checksum += (a?.length ?? 0) + (b?.length ?? 0) + (c?.length ?? 0) + (d ? 1 : 0) + (e ? 2 : 0);
  }
  const parse = performance.now() - t0;

  t0 = performance.now();
  for (const href of hrefs) {
    const id = ClickInterceptor.extractFileId(href, null);
    checksum += id?.length ?? 0;
  }
  for (const href of NMM_HREFS) {
    if (ClickInterceptor.isNMMDownload(null, href)) checksum += 17;
  }
  for (const href of PLAIN_HREFS) {
    if (!ClickInterceptor.isNMMDownload(null, href)) checksum += 19;
  }
  // Negative control: only the example.com href is non-NMM.
  if (ClickInterceptor.isNMMDownload(null, PLAIN_HREFS[0])) checksum += 23;
  const click = performance.now() - t0;

  t0 = performance.now();
  for (const path of routes) {
    const r = extractCollectionRouteDetails(path);
    checksum += r ? r.collectionSlug.length + r.gameDomain.length + (r.revisionNumber ?? 0) : 1;
  }
  const route = performance.now() - t0;

  t0 = performance.now();
  for (let i = 0; i < PAUSE_COUNT; i++) {
    checksum += RateLimiter.calculateFilePause(512 + (i % 65536), 1.5, 5);
  }
  const pause = performance.now() - t0;

  return { revision, match, parse, click, route, pause, checksum };
}

// Warmup (JIT, caches) — untimed.
for (let i = 0; i < WARMUP; i++) runOnce();

const totals = { revision: 0, match: 0, parse: 0, click: 0, route: 0, pause: 0 };
let checksum = 0;
for (let i = 0; i < ITERATIONS; i++) {
  const r = runOnce();
  totals.revision += r.revision;
  totals.match += r.match;
  totals.parse += r.parse;
  totals.click += r.click;
  totals.route += r.route;
  totals.pause += r.pause;
  if (i === 0) checksum = r.checksum;
  else if (r.checksum !== checksum) {
    console.error(`checksum drift on iteration ${i}: ${r.checksum} != ${checksum}`);
    process.exit(1);
  }
}

// Sanity: workload must be non-trivial.
const diffCheck = RevisionDiffer.diff(current, next);
if (diffCheck.added.length === 0 || diffCheck.removed.length === 0) {
  console.error('workload trivial: revision diff empty');
  process.exit(1);
}
const matchCheck = FileMatcher.matchFiles(localFiles, current);
if (matchCheck.matchedMods.length === 0) {
  console.error('workload trivial: file match empty');
  process.exit(1);
}

const mean = (total: number): string => (total / ITERATIONS).toFixed(3);
const total = totals.revision + totals.match + totals.parse + totals.click + totals.route + totals.pause;

console.log(`METRIC ux_workload_ms=${mean(total)}`);
console.log(`METRIC revision_diff_ms=${mean(totals.revision)}`);
console.log(`METRIC file_match_ms=${mean(totals.match)}`);
console.log(`METRIC download_parse_ms=${mean(totals.parse)}`);
console.log(`METRIC click_resolve_ms=${mean(totals.click)}`);
console.log(`METRIC route_parse_ms=${mean(totals.route)}`);
console.log(`METRIC pause_calc_ms=${mean(totals.pause)}`);
console.log(`METRIC workload_checksum=${checksum}`);
