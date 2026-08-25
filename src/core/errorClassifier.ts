// src/core/errorClassifier.ts — one classify() per FR6.
// Maps response text/status/headers → ErrorClass. Policy layered on top.

import type { ErrorClass } from "./types.js";
import {
  CF_HEADER_KEYS,
  CF_MARKERS,
  LOGIN_MARKERS,
  SUSPENDED_MARKERS,
} from "./siteAdapters.js";

export interface ClassifyInput {
  status?: number;
  body?: string;
  headers?: Record<string, string>;
  networkError?: boolean;
}

export function classify(input: ClassifyInput): ErrorClass {
  if (input.networkError) return "network";
  const status = input.status ?? 0;
  const body = (input.body ?? "").slice(0, 4096).toLowerCase();
  const headers = input.headers ?? {};

  if (status === 401 || status === 403) {
    if (hasCfMarker(headers, body)) return "cloudflare";
    if (body.length > 0) {
      for (const re of LOGIN_MARKERS) if (re.test(body)) return "login";
    }
    if (status === 401) return "login";
  }

  if (hasCfMarker(headers, body)) {
    if (status === 403 || status === 503 || status === 429) return "cloudflare";
    if (status >= 500) return "cloudflare";
  }

  for (const re of SUSPENDED_MARKERS) if (re.test(body)) return "suspended";

  if (status >= 500) return "network";
  if (status === 0 && body.length === 0) return "network";

  return "unresolved";
}

function hasCfMarker(headers: Record<string, string>, body: string): boolean {
  for (const k of CF_HEADER_KEYS) {
    if (headers[k] !== undefined) return true;
  }
  for (const re of CF_MARKERS) if (re.test(body)) return true;
  return false;
}

const FATAL_ERROR_CLASSES: Record<ErrorClass, boolean> = {
  login: true,
  cloudflare: true,
  suspended: true,
  network: false,
  unresolved: false,
};

export function isFatal(err: ErrorClass): boolean {
  return FATAL_ERROR_CLASSES[err] === true;
}

export function errorClassDisplay(
  err: ErrorClass,
): { message: string; link?: string; linkText?: string } {
  switch (err) {
    case "login":
      return {
        message: "Nexus session expired or not logged in.",
        link: "https://www.nexusmods.com/users/login",
        linkText: "Sign in",
      };
    case "cloudflare":
      return {
        message:
          "Blocked by a Cloudflare challenge. Solve it in the page, then retry.",
        linkText: "Open challenge",
      };
    case "suspended":
      return {
        message:
          "Your Nexus account is temporarily suspended. Wait it out.",
      };
    case "network":
      return { message: "Network error talking to Nexus. Check your connection." };
    case "unresolved":
      return { message: "Could not resolve a download link from this page." };
  }
}
