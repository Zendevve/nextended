// src/core/messages.ts — Msg discriminated union from PRD §2.5, plus typed send/handle.
// Background handlers are pure request/response, serialized per message type
// (no push from background; content polls budget at 1 Hz during countdowns).

import type { BudgetState } from "./types.js";

export type Msg =
  | { t: "budget:get" }
  | { t: "budget:spend"; key: string }
  | { t: "download:browser"; url: string; filename?: string }
  | { t: "dedupe:check"; key: string }
  | { t: "dedupe:record"; key: string };

export type BudgetDerived = {
  allowed: boolean;
  waitMs: number;
  used: number;
  window: number;
};

export type MsgResponse<M extends Msg> =
  M extends { t: "budget:get" }
    ? { state: BudgetState; derived: BudgetDerived }
    : M extends { t: "budget:spend" }
      ? { ok: true } | { ok: false; waitMs: number }
      : M extends { t: "download:browser" }
        ? { ok: true; downloadId: number } | { ok: false; error: string }
        : M extends { t: "dedupe:check" }
          ? { hit: boolean; launchedAt?: number }
          : M extends { t: "dedupe:record" }
            ? { ok: true }
            : never;

export function isMsg(value: unknown): value is Msg {
  if (!value || typeof value !== "object") return false;
  if (!("t" in value)) return false;
  const t = (value as Record<string, unknown>).t;
  return (
    t === "budget:get" ||
    t === "budget:spend" ||
    t === "download:browser" ||
    t === "dedupe:check" ||
    t === "dedupe:record"
  );
}

type Handler<M extends Msg> = (msg: M) => Promise<MsgResponse<M>>;
type AnyHandler = (msg: Msg) => Promise<unknown>;

const handlers: Partial<{ [K in Msg["t"]]: Handler<Extract<Msg, { t: K }>> }> = {};

/**
 * Register a typed handler for a single message variant. Each message `t` accepts
 * exactly one handler; the latest registration wins.
 */
export function on<K extends Msg["t"]>(
  type: K,
  handler: Handler<Extract<Msg, { t: K }>>,
): void {
  (handlers as Record<string, AnyHandler>)[type] = handler as AnyHandler;
}

/** Dispatch a message to its registered handler. Throws if no handler is registered. */
export async function dispatch<M extends Msg>(msg: M): Promise<MsgResponse<M>> {
  const handler = handlers[msg.t] as Handler<M> | undefined;
  if (!handler) {
    throw new Error(`[Nextended] no handler registered for msg.t=${msg.t}`);
  }
  return handler(msg);
}

/**
 * Send a message from the content script to the background worker and await a
 * typed response. Returns null on serialization/round-trip failure; callers must
 * treat null as a transient network or worker-restart error.
 */
export async function send<M extends Msg>(msg: M): Promise<MsgResponse<M> | null> {
  try {
    const response = (await chrome.runtime.sendMessage(msg)) as
      | MsgResponse<M>
      | undefined;
    return response ?? null;
  } catch {
    return null;
  }
}
