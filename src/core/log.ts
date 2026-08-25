// src/core/log.ts — structured debug logging per PRD FR12.
// Local-only; no telemetry (D13). Always prefixed with [Nextended] for grep-ability.

import type { Settings } from "./settings.js";

export interface Logger {
  event(name: string, data?: unknown): void;
  warn(name: string, data?: unknown): void;
  error(name: string, err: unknown): void;
}

const TAG = "[Nextended]";

function safeStringify(data: unknown): string {
  try {
    return data === undefined ? "" : JSON.stringify(data);
  } catch {
    return String(data);
  }
}

function makeEvent(enabled: boolean) {
  return (name: string, data?: unknown) => {
    if (!enabled) return;
    console.debug(`${TAG} ${name}${data === undefined ? "" : " " + safeStringify(data)}`);
  };
}

function makeWarn() {
  return (name: string, data?: unknown) => {
    console.warn(`${TAG} ${name}${data === undefined ? "" : " " + safeStringify(data)}`);
  };
}

function makeError() {
  return (name: string, err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`${TAG} ${name} ${message}`);
  };
}

export function makeLogger(debugMode: boolean): Logger {
  return {
    event: makeEvent(debugMode),
    warn: makeWarn(),
    error: makeError(),
  };
}

export const SILENT_LOGGER: Logger = {
  event: () => {},
  warn: () => {},
  error: () => {},
};

export function loggerFor(settings: Settings): Logger {
  return settings.debugMode ? makeLogger(true) : SILENT_LOGGER;
}
