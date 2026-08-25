// src/core/resolver.ts — single resolve() per FR3, used by every module.
// Strategy chain, in order, stopping at first success. Every attempt records
// {strategy, elapsedMs}; every failure is classified by the error classifier.

import { classify, type ClassifyInput } from "./errorClassifier.js";
import {
  ENDPOINT_API_FILES,
  ENDPOINT_GENERATE_DOWNLOAD_URL,
  HTTP_URL_RE,
  NXM_URL_RE,
  PAGE_REGEX_URL_PATTERNS,
  SECURE_DOWNLOAD_KEYS,
  MODAL_TAG,
  BUTTONS_TAG,
  FILE_DOWNLOAD_TAG,
} from "./siteAdapters.js";
import type { HttpClient } from "./graphql.js";
import type { ErrorClass, Strategy } from "./types.js";

export interface ResolveInput {
  gameDomain: string;
  gameNumericId: number;
  modId: string;
  fileId: string;
  nxmUrl?: string;
  modPageHtml?: string;
  componentAttrs?: Record<string, unknown>;
}

export interface ResolveOk {
  ok: true;
  url: string;
  strategy: Strategy;
  elapsedMs: number;
}

export interface ResolveAttempt {
  strategy: Strategy;
  elapsedMs: number;
  status?: number;
  error?: string;
}

export interface ResolveErr {
  ok: false;
  error: ErrorClass;
  evidence: string;
  attempts: ResolveAttempt[];
}

export type ResolveResult = ResolveOk | ResolveErr;

export interface ResolveContext {
  isNMM: boolean;
  signal: AbortSignal;
  client: HttpClient;
}

const EVIDENCE_LIMIT = 500;

const STRATEGY_ORDER: Strategy[] = [
  "nxm-passthrough",
  "component-attr",
  "api-files",
  "page-regex",
  "generate-nmm",
  "generate-plain",
  "deep-scrape",
];

export async function resolve(
  input: ResolveInput,
  ctx: ResolveContext,
): Promise<ResolveResult> {
  const attempts: ResolveAttempt[] = [];

  for (const strategy of STRATEGY_ORDER) {
    const started = now();
    try {
      if (ctx.signal.aborted) {
        return finishFailed(attempts, "network", "aborted before strategy " + strategy);
      }
      const url = await runStrategy(strategy, input, ctx);
      if (url) {
        return {
          ok: true,
          url,
          strategy,
          elapsedMs: now() - started,
        };
      }
      attempts.push({ strategy, elapsedMs: now() - started });
    } catch (e: unknown) {
      const elapsedMs = now() - started;
      const err = e as { status?: number; message?: string };
      const status = typeof err.status === "number" ? err.status : undefined;
      const message = err instanceof Error ? err.message : String(e);
      const attempt: ResolveAttempt = { strategy, elapsedMs, error: message };
      if (status !== undefined) attempt.status = status;
      attempts.push(attempt);
      if (
        (strategy === "generate-nmm" || strategy === "generate-plain") &&
        status === 401
      ) {
        return finishFailed(attempts, "login", evidence(message));
      }
    }
  }

  return finishFailed(attempts, "unresolved", "all strategies exhausted");
}

function runStrategy(
  strategy: Strategy,
  input: ResolveInput,
  ctx: ResolveContext,
): string | null | Promise<string | null> {
  switch (strategy) {
    case "nxm-passthrough":
      return nxmPassthrough(input);
    case "component-attr":
      return componentAttr(input);
    case "api-files":
      return apiFiles(input, ctx);
    case "page-regex":
      return pageRegex(input);
    case "generate-nmm":
      return generate(input, ctx, true);
    case "generate-plain":
      return generate(input, ctx, false);
    case "deep-scrape":
      return deepScrape(input, ctx);
  }
}

function nxmPassthrough(input: ResolveInput): string | null {
  const candidate = input.nxmUrl;
  if (!candidate) return null;
  return NXM_URL_RE.test(candidate) ? candidate : null;
}

function componentAttr(input: ResolveInput): string | null {
  const attrs = input.componentAttrs;
  if (!attrs) return null;
  for (const key of SECURE_DOWNLOAD_KEYS) {
    const value = attrs[key];
    if (typeof value === "string" && HTTP_URL_RE.test(value)) return value;
    if (typeof value === "string" && NXM_URL_RE.test(value)) return value;
  }
  for (const tagName of [MODAL_TAG, BUTTONS_TAG, FILE_DOWNLOAD_TAG]) {
    const wrapped = (attrs as Record<string, unknown>)[tagName];
    if (!wrapped || typeof wrapped !== "object") continue;
    const found = findDownloadUrlDeep(wrapped as Record<string, unknown>);
    if (found) return found;
  }
  return null;
}

function findDownloadUrlDeep(node: Record<string, unknown>): string | null {
  for (const key of SECURE_DOWNLOAD_KEYS) {
    const v = node[key];
    if (typeof v === "string" && HTTP_URL_RE.test(v)) return v;
  }
  for (const value of Object.values(node)) {
    if (value && typeof value === "object") {
      const found = findDownloadUrlDeep(value as Record<string, unknown>);
      if (found) return found;
    }
  }
  return null;
}

async function apiFiles(
  input: ResolveInput,
  ctx: ResolveContext,
): Promise<string | null> {
  const params = new URLSearchParams();
  params.set("id", input.fileId);
  if (ctx.isNMM) params.set("nmm", "1");
  const url = `${ENDPOINT_API_FILES}?${params.toString()}`;
  const init: Parameters<HttpClient["fetch"]>[0] = {
    url,
    method: "GET",
    credentials: "include",
  };
  if (ctx.signal) init.signal = ctx.signal;
  const res = await ctx.client.fetch(init);
  if (!res.ok) {
    const err = new Error(`api-files HTTP ${res.status}`);
    (err as { status?: number }).status = res.status;
    throw err;
  }
  return findDownloadUrlDeep(asRecord(res.body));
}

function pageRegex(input: ResolveInput): string | null {
  const html = input.modPageHtml;
  if (!html) return null;
  for (const pattern of PAGE_REGEX_URL_PATTERNS) {
    const m = html.match(pattern);
    if (m && typeof m[1] === "string") return m[1];
  }
  return null;
}

async function generate(
  input: ResolveInput,
  ctx: ResolveContext,
  nmm: boolean,
): Promise<string | null> {
  const body = new URLSearchParams();
  body.set("game_id", String(input.gameNumericId));
  body.set("mod_id", input.modId);
  body.set("file_id", input.fileId);
  if (nmm) body.set("nmm", "1");
  const init: Parameters<HttpClient["fetch"]>[0] = {
    url: ENDPOINT_GENERATE_DOWNLOAD_URL,
    method: "POST",
    body: body.toString(),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    credentials: "include",
  };
  if (ctx.signal) init.signal = ctx.signal;
  const res = await ctx.client.fetch(init);
  if (!res.ok) {
    const err = new Error(`generate(${nmm ? "nmm" : "plain"}) HTTP ${res.status}`);
    (err as { status?: number }).status = res.status;
    throw err;
  }
  const rec = asRecord(res.body);
  const candidates = [rec["uri"], rec["url"], rec["downloadUrl"]];
  for (const c of candidates) {
    if (typeof c === "string" && HTTP_URL_RE.test(c)) return c;
  }
  return null;
}

async function deepScrape(
  input: ResolveInput,
  ctx: ResolveContext,
): Promise<string | null> {
  const modPageUrl = `https://www.nexusmods.com/${input.gameDomain}/mods/${input.modId}?tab=files&file_id=${input.fileId}&nmm=1`;
  const init: Parameters<HttpClient["fetch"]>[0] = {
    url: modPageUrl,
    method: "GET",
    credentials: "include",
  };
  if (ctx.signal) init.signal = ctx.signal;
  const res = await ctx.client.fetch(init);
  if (!res.ok) {
    const err = new Error(`deep-scrape HTTP ${res.status}`);
    (err as { status?: number }).status = res.status;
    throw err;
  }
  const html = typeof res.body === "string" ? res.body : JSON.stringify(res.body);
  for (const pattern of PAGE_REGEX_URL_PATTERNS) {
    const m = html.match(pattern);
    if (m && typeof m[1] === "string") return m[1];
  }
  return null;
}

function finishFailed(
  attempts: ResolveAttempt[],
  error: ErrorClass,
  evidence: string,
): ResolveErr {
  return { ok: false, error, evidence, attempts };
}

function evidence(message: string): string {
  return message.length > EVIDENCE_LIMIT ? message.slice(0, EVIDENCE_LIMIT) : message;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export function classifyHttpOutcome(input: ClassifyInput): ErrorClass {
  return classify(input);
}
