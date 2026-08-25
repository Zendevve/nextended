// Benchmark harness: deterministic, network-free workload exercising the
// core modules (resolver strategy chain, error classifier, pacing math, key
// utilities). Reports METRIC lines for the autoresearch loop.
//
// Workload is bounded and pure — same input every run, no live network, no
// time-of-day dependencies.

import { resolve, type ResolveInput, type ResolveContext } from "../src/core/resolver.js";
import { classify } from "../src/core/errorClassifier.js";
import { pacingMs, estimateRunDurationMs } from "../src/core/pacing.js";
import {
  dedupeKey,
  dedupeHas,
  parseDedupeKey,
  pruneDedupe,
  chunkItems,
  itemsKeyFor,
  parseItemsKey,
} from "../src/core/keys.js";
import type { HttpClient, HttpResponse } from "../src/core/graphql.js";
import type { DedupeEntry, QueueItem } from "../src/core/types.js";
import { DEFAULT_SETTINGS, type Settings } from "../src/core/settings.js";

const ITERATIONS = 4000;

// ---------- Fakes ----------

type FetchInput = Parameters<HttpClient["fetch"]>[0];

function jsonRes(status: number, body: unknown): HttpResponse {
  return {
    status,
    ok: status >= 200 && status < 300,
    body,
    headers: { "content-type": "application/json" },
  };
}

function textRes(status: number, body: string): HttpResponse {
  return { status, ok: status >= 200 && status < 300, body, headers: {} };
}

function makeClient(responder: (url: string, init: FetchInput) => HttpResponse): HttpClient {
  return { async fetch(input) { return responder(input.url, input); } };
}

function baseInput(over: Partial<ResolveInput> = {}): ResolveInput {
  return {
    gameDomain: "skyrim",
    gameNumericId: 110,
    modId: "12345",
    fileId: "67890",
    ...over,
  };
}

function baseCtx(client: HttpClient): ResolveContext {
  return {
    isNMM: true,
    signal: new AbortController().signal,
    client,
  };
}

// ---------- Cohorts ----------

const nxmInput = baseInput({ nxmUrl: "nxm://skyrim/mods/1/files/2?key=k&expires=1&user_id=1" });
const nxmCtx = baseCtx(makeClient(() => jsonRes(200, {})));

const compInput = baseInput({
  componentAttrs: {
    "MOD-DOWNLOAD-MODAL": {
      nested: { vortexDownloadUrl: "https://cdn.example.com/y.zip" },
    },
  },
});
const compCtx = baseCtx(makeClient(() => jsonRes(200, {})));

const pageInput = baseInput({
  modPageHtml: `<a href="https://www.nexus-cdn.com/path/Skyrim.zip?h=abc">x</a>`,
});
const pageCtx = baseCtx(makeClient(() => jsonRes(404, {})));

const genNmmCtx = baseCtx(
  makeClient((url, init) => {
    if (url.includes("GenerateDownloadUrl") && init.body?.includes("nmm=1")) {
      return jsonRes(200, { uri: "https://cdn.example.com/nmm.zip" });
    }
    return jsonRes(404, { error: "missing" });
  }),
);

const genPlainCtx = baseCtx(
  makeClient((url, init) => {
    if (url.includes("GenerateDownloadUrl")) {
      if (init.body?.includes("nmm=1")) return jsonRes(500, { error: "nope" });
      return jsonRes(200, { uri: "https://cdn.example.com/plain.zip" });
    }
    return jsonRes(404, {});
  }),
);

const deepHtml = `<a href="https://www.nexus-cdn.com/Mod.zip?h=abc">x</a>`;
const deepCtx = baseCtx(
  makeClient((url) => {
    if (url.includes("GenerateDownloadUrl")) return jsonRes(500, {});
    if (url.includes("/mods/")) return textRes(200, deepHtml);
    return jsonRes(404, {});
  }),
);

const failCtx = baseCtx(makeClient(() => jsonRes(404, {})));

const resolverCohorts: Array<{ name: string; input: ResolveInput; ctx: ResolveContext }> = [
  { name: "nxm-passthrough", input: nxmInput, ctx: nxmCtx },
  { name: "component-attr", input: compInput, ctx: compCtx },
  { name: "page-regex", input: pageInput, ctx: pageCtx },
  { name: "generate-nmm", input: baseInput(), ctx: genNmmCtx },
  { name: "generate-plain", input: baseInput(), ctx: genPlainCtx },
  { name: "deep-scrape", input: baseInput(), ctx: deepCtx },
  { name: "all-fail", input: baseInput(), ctx: failCtx },
];

// ---------- Classifier workload ----------

const classifierInputs: Array<Parameters<typeof classify>[0]> = [
  { networkError: true },
  { status: 401, body: "Please log in to continue" },
  { status: 403, body: "" },
  { status: 401, body: "cf-chl-bypass required", headers: { "cf-mitigated": "challenge" } },
  { status: 503, body: "service unavailable", headers: { server: "cloudflare" } },
  { status: 200, body: "Your account is suspended" },
  { status: 500, body: "" },
  { status: 0, body: "" },
  { status: 200, body: "all good" },
];

// ---------- Pacing workload ----------

const pacingSizes: number[] = [];
for (let i = 1; i <= 256; i++) pacingSizes.push(i * 1024);
const PACING_PARAMS = { speed: DEFAULT_SETTINGS.assumedSpeedMBps, pause: DEFAULT_SETTINGS.extraPauseSeconds };

// ---------- Keys workload ----------

const keyDoms = ["skyrim", "fallout4", "bg3", "cyberpunk2077", "stardew"];
const keyModIds: string[] = [];
const keyFileIds: string[] = [];
for (let i = 0; i < 64; i++) keyModIds.push(String(1000 + i));
for (let i = 0; i < 64; i++) keyFileIds.push(String(9000 + i));

const dedupeEntries: DedupeEntry[] = [];
for (let i = 0; i < 256; i++) {
  const dom = keyDoms[i % keyDoms.length]!;
  const mod = keyModIds[i % keyModIds.length]!;
  const file = keyFileIds[i % keyFileIds.length]!;
  dedupeEntries.push({ key: dedupeKey(dom, mod, file), launchedAt: i * 60_000 });
}

function buildQueueItems(n: number): QueueItem[] {
  const out: QueueItem[] = [];
  for (let i = 0; i < n; i++) {
    const dom = keyDoms[i % keyDoms.length]!;
    const mod = keyModIds[i % keyModIds.length]!;
    const file = keyFileIds[i % keyFileIds.length]!;
    out.push({
      key: dedupeKey(dom, mod, file),
      fileId: file,
      modId: mod,
      gameDomain: dom,
      gameNumericId: 110,
      modName: `mod-${i}`,
      fileName: `file-${i}.zip`,
      fileUri: `nxm://${dom}/mods/${mod}/files/${file}`,
      sizeKB: 1024 * (i + 1),
      optional: i % 5 === 0,
      modPageUrl: `https://www.nexusmods.com/${dom}/mods/${mod}?tab=files&file_id=${file}`,
      status: "pending",
      updatedAt: i,
    });
  }
  return out;
}
const chunkInput = buildQueueItems(500);

// ---------- Workers ----------

function median(xs: number[]): number {
  const s = xs.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!;
}

// ---------- Workers ----------

async function runResolverCohort(
  input: ResolveInput,
  ctx: ResolveContext,
  iters: number,
): Promise<{ samples: number[]; total: number; ok: number; err: number }> {
  const samples: number[] = [];
  let ok = 0;
  let err = 0;
  for (let i = 0; i < iters; i++) {
    const t0 = process.hrtime.bigint();
    const r = await resolve(input, ctx);
    const dt = Number(process.hrtime.bigint() - t0);
    samples.push(dt);
    if (r.ok) ok++;
    else err++;
  }
  return { samples, total: samples.reduce((a, b) => a + b, 0), ok, err };
}

function runClassifier(iters: number): number {
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < iters; i++) {
    classify(classifierInputs[i % classifierInputs.length]!);
  }
  return Number(process.hrtime.bigint() - t0);
}

function runPacing(sizes: number[], iters: number, settings: Settings): number {
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < iters; i++) {
    for (const s of sizes) pacingMs(s, settings.assumedSpeedMBps, settings.extraPauseSeconds);
  }
  return Number(process.hrtime.bigint() - t0);
}

function runEstimate(sizes: number[], iters: number, settings: Settings): number {
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < iters; i++) {
    estimateRunDurationMs(sizes, settings);
  }
  return Number(process.hrtime.bigint() - t0);
}

function runKeys(iters: number): number {
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < iters; i++) {
    const dom = keyDoms[i % keyDoms.length]!;
    const mod = keyModIds[i % keyModIds.length]!;
    const file = keyFileIds[i % keyFileIds.length]!;
    const key = dedupeKey(dom, mod, file);
    parseDedupeKey(key);
    dedupeHas(dedupeEntries, key, Date.now(), 24 * 60 * 60 * 1000);
    pruneDedupe(dedupeEntries, Date.now(), 24 * 60 * 60 * 1000);
    const itemsKey = itemsKeyFor("run-xyz", i % 5);
    parseItemsKey(itemsKey);
  }
  return Number(process.hrtime.bigint() - t0);
}

function runChunk(iters: number): number {
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < iters; i++) {
    const chunks = chunkItems(`run-${i % 4}`, chunkInput);
    let sink = 0;
    for (const c of chunks) sink += c.items.length;
    if (sink < 0) throw new Error("unreachable");
  }
  return Number(process.hrtime.bigint() - t0);
}

// (duplicates removed)

// ---------- Main ----------

const RUNS = 5;

interface RunSample {
  totalMs: number;
  resolverMs: number;
  classifierMs: number;
  pacingMs: number;
  estimateMs: number;
  keysMs: number;
  chunkMs: number;
  cohortTotals: CohortMetric[];
}

interface CohortMetric {
  name: string;
  totalMs: number;
  medianMs: number;
  ok: number;
  err: number;
  iters: number;
}

async function singleRun(): Promise<RunSample> {
  const tStart = process.hrtime.bigint();
  let resolverTotalNs = 0n;
  const cohortMetrics: CohortMetric[] = [];

  for (const cohort of resolverCohorts) {
    const r = await runResolverCohort(cohort.input, cohort.ctx, ITERATIONS);
    resolverTotalNs += BigInt(r.total);
    cohortMetrics.push({
      name: cohort.name,
      totalMs: Number(BigInt(r.total)) / 1_000_000,
      medianMs: Number(BigInt(median(r.samples))) / 1_000_000,
      ok: r.ok,
      err: r.err,
      iters: ITERATIONS,
    });
  }
  const classifierNs = BigInt(runClassifier(ITERATIONS * 4));
  const pacingNs = BigInt(runPacing(pacingSizes, ITERATIONS, DEFAULT_SETTINGS));
  const estimateNs = BigInt(runEstimate(pacingSizes, ITERATIONS, DEFAULT_SETTINGS));
  const keysNs = BigInt(runKeys(ITERATIONS * 2));
  const chunkNs = BigInt(runChunk(2000));
  const totalNs = process.hrtime.bigint() - tStart;

  const toMs = (n: bigint): number => Number(n) / 1_000_000;
  return {
    totalMs: toMs(totalNs),
    resolverMs: toMs(resolverTotalNs),
    classifierMs: toMs(classifierNs),
    pacingMs: toMs(pacingNs),
    estimateMs: toMs(estimateNs),
    keysMs: toMs(keysNs),
    chunkMs: toMs(chunkNs),
    cohortTotals: cohortMetrics,
  };
}

function gcHint(): void {
  const g = globalThis as { gc?: unknown };
  if (typeof g.gc === "function") (g.gc as () => void)();
}

async function main(): Promise<void> {
  // Warmup — let V8 settle.
  for (let i = 0; i < 200; i++) {
    classify(classifierInputs[i % classifierInputs.length]!);
    pacingMs(1024, DEFAULT_SETTINGS.assumedSpeedMBps, DEFAULT_SETTINGS.extraPauseSeconds);
  }
  await runResolverCohort(nxmInput, nxmCtx, 200);

  // Take RUNS full passes; report median as the primary metric and min/max
  // for noise-floor visibility. Median-of-N reduces scheduler/GC jitter.
  const totals: number[] = [];
  const samples: RunSample[] = [];
  for (let r = 0; r < RUNS; r++) {
    gcHint();
    const sample = await singleRun();
    samples.push(sample);
    totals.push(sample.totalMs);
  }

  // Sanity invariants — only on the last sample.
  const last = samples[samples.length - 1]!;
  for (const c of last.cohortTotals) {
    if (c.ok + c.err !== c.iters) {
      throw new Error(`cohort ${c.name}: ok+err != iters`);
    }
  }
  const allFail = last.cohortTotals.find((c) => c.name === "all-fail");
  if (!allFail || allFail.ok !== 0) {
    throw new Error("all-fail cohort should have 0 ok");
  }
  for (const name of ["nxm-passthrough", "component-attr", "page-regex", "generate-nmm", "generate-plain", "deep-scrape"]) {
    const c = last.cohortTotals.find((x) => x.name === name);
    if (!c || c.ok !== c.iters) {
      throw new Error(`${name} cohort should have all-ok`);
    }
  }

  totals.sort((a, b) => a - b);
  const totalMedian = totals[Math.floor(totals.length / 2)]!;
  const totalMin = totals[0]!;
  const totalMax = totals[totals.length - 1]!;

  // Aggregate secondary metrics using the last sample (representative).
  console.log(`METRIC harness_total_ms=${totalMedian.toFixed(3)}`);
  console.log(`ASI harness_total_ms_min=${totalMin.toFixed(3)}`);
  console.log(`ASI harness_total_ms_max=${totalMax.toFixed(3)}`);
  console.log(`ASI harness_total_ms_runs=${RUNS}`);
  console.log(`METRIC resolver_total_ms=${last.resolverMs.toFixed(3)}`);
  console.log(`METRIC classifier_ms=${last.classifierMs.toFixed(3)}`);
  console.log(`METRIC pacing_ms=${last.pacingMs.toFixed(3)}`);
  console.log(`METRIC estimate_ms=${last.estimateMs.toFixed(3)}`);
  console.log(`METRIC keys_ms=${last.keysMs.toFixed(3)}`);
  console.log(`METRIC chunk_ms=${last.chunkMs.toFixed(3)}`);

  for (const c of last.cohortTotals) {
    console.log(`METRIC resolver_${c.name}_median_ms=${c.medianMs.toFixed(4)}`);
    console.log(`METRIC resolver_${c.name}_total_ms=${c.totalMs.toFixed(3)}`);
  }
}

await main();
