// src/content/modules/nowait/index.ts — NoWait click interception + auto-start.
// FR4. Mounts on `mod` PageContext.

import { resolve, type ResolveInput, type ResolveResult } from "../../../core/resolver.js";
import { fetchHttpClient } from "../../../core/graphql.js";
import {
  isExcludedPath,
  NXM_URL_RE,
  SLOW_DOWNLOAD_BTN_RE,
} from "../../../core/siteAdapters.js";
import { send } from "../../../core/messages.js";
import { settings } from "../../../content/settings-bridge.js";
import { dedupeKey } from "../../../core/keys.js";
import { errorClassDisplay } from "../../../core/errorClassifier.js";
import { clearContent } from "../../../content/ui/root.js";
import { showToast } from "../../../content/ui/toast.js";
import type { Module } from "../../../content/router.js";
import type { PageContext } from "../../../core/types.js";

const autoStartAttempted = new Set<string>();
let unsubscribeSettings: (() => void) | null = null;
let lastKnownContext:
  | { gameDomain: string; modId: string; fileId: string | null; tab: string | null }
  | null = null;

function asModContext(
  ctx: PageContext,
):
  | { gameDomain: string; modId: string; fileId: string | null; tab: string | null }
  | null {
  if (ctx.kind !== "mod") return null;
  return ctx;
}

function showCooldownToast(waitMs: number): void {
  const started = Date.now();
  const tick = () => {
    const remaining = waitMs - (Date.now() - started);
    if (remaining <= 0) return;
    const mm = Math.floor(remaining / 60_000);
    const ss = Math.floor((remaining % 60_000) / 1000)
      .toString()
      .padStart(2, "0");
    showToast({ message: `Cooldown: ${mm}:${ss}`, variant: "cooldown", durationMs: 1000 });
  };
  tick();
  const i = setInterval(tick, 1000);
  setTimeout(() => clearInterval(i), waitMs);
}

function showErrorToast(cls: string, evidence: string): void {
  const display = errorClassDisplay(cls as never);
  const link = display.link
    ? { actionLabel: display.linkText ?? "Open", actionHref: display.link }
    : {};
  showToast({
    message: `${display.message}${evidence ? ` — ${evidence.slice(0, 80)}` : ""}`,
    variant: "error",
    ...link,
  });
}

async function launchForContext(
  ctx: { gameDomain: string; modId: string; fileId: string | null },
  bypassDedupe: boolean,
): Promise<void> {
  if (!ctx.fileId) return;
  const live = settings.snapshot();
  const key = dedupeKey(ctx.gameDomain, ctx.modId, ctx.fileId);
  const budget = await send({ t: "budget:spend", key });
  if (!budget || !("ok" in budget)) return;
  if (!budget.ok) {
    showCooldownToast(budget.waitMs);
    return;
  }
  const resolveInput: ResolveInput = {
    gameDomain: ctx.gameDomain,
    gameNumericId: 0,
    modId: ctx.modId,
    fileId: ctx.fileId,
  };
  const ac = new AbortController();
  const result: ResolveResult = await resolve(resolveInput, {
    isNMM: live.downloadMode === "vortex",
    signal: ac.signal,
    client: fetchHttpClient(),
  });
  if (!result.ok) {
    showErrorToast(result.error, result.evidence);
    return;
  }
  if (!bypassDedupe) {
    await send({ t: "dedupe:record", key });
  }
  if (live.downloadMode === "vortex") {
    if (NXM_URL_RE.test(result.url)) {
      window.location.assign(result.url);
    } else {
      await send({ t: "download:browser", url: result.url });
    }
  } else {
    await send({ t: "download:browser", url: result.url });
  }
  if (live.autoCloseTab) {
    setTimeout(() => window.close(), live.closeTabDelayMs);
  }
}

async function launchWithNxm(
  ctx: { gameDomain: string; modId: string; fileId: string | null },
  nxm: string,
): Promise<void> {
  const live = settings.snapshot();
  const key = `${ctx.gameDomain}:${ctx.modId}:${ctx.fileId ?? "?"}`;
  const budget = await send({ t: "budget:spend", key });
  if (!budget || !("ok" in budget)) return;
  if (!budget.ok) {
    showCooldownToast(budget.waitMs);
    return;
  }
  if (!ctx.fileId) {
    showToast({ message: "No file id in URL — cannot record dedupe.", variant: "error" });
    return;
  }
  await send({
    t: "dedupe:record",
    key: dedupeKey(ctx.gameDomain, ctx.modId, ctx.fileId),
  });
  if (live.downloadMode === "vortex") {
    window.location.assign(nxm);
  } else {
    await send({ t: "download:browser", url: nxm });
  }
}

async function tryAutoStart(ctx: {
  gameDomain: string;
  modId: string;
  fileId: string | null;
}): Promise<void> {
  const live = settings.snapshot();
  if (!live.autoStartOnFileId) return;
  if (!ctx.fileId) return;
  const key = `${ctx.gameDomain}:${ctx.modId}:${ctx.fileId}`;
  if (autoStartAttempted.has(key)) return;
  autoStartAttempted.add(key);
  const dedupe = await send({ t: "dedupe:check", key });
  if (dedupe && "hit" in dedupe && dedupe.hit) {
    showToast({
      message: "Already downloaded recently — Download anyway?",
      variant: "dedupe",
      actionLabel: "Download anyway",
      onAction: () => {
        void launchForContext(ctx, true);
      },
    });
    return;
  }
  await launchForContext(ctx, false);
}

function onClickCapture(ev: MouseEvent): void {
  if (isExcludedPath(location.href)) return;
  const path = ev.composedPath();
  for (const node of path) {
    if (!(node instanceof HTMLElement)) continue;
    if (node.tagName !== "A" && node.tagName !== "BUTTON") continue;
    const href = (node as HTMLAnchorElement).href;
    if (NXM_URL_RE.test(href)) {
      ev.preventDefault();
      ev.stopPropagation();
      const ctx = lastKnownContext;
      if (ctx) void launchWithNxm(ctx, href);
      return;
    }
    const text = node.textContent?.trim() ?? "";
    if (SLOW_DOWNLOAD_BTN_RE.test(text)) {
      ev.preventDefault();
      ev.stopPropagation();
      const original = text;
      node.textContent = "Please wait…";
      setTimeout(() => {
        node.textContent = original;
      }, 4000);
      const ctx = lastKnownContext;
      if (ctx) void launchForContext(ctx, false);
      return;
    }
  }
}

export const nowaitModule: Module<undefined> = {
  matches(ctx) {
    return ctx.kind === "mod";
  },
  mount(ctx) {
    const mod = asModContext(ctx);
    if (!mod) return;
    lastKnownContext = mod;
    document.addEventListener("click", onClickCapture, true);
    if (unsubscribeSettings) unsubscribeSettings();
    unsubscribeSettings = settings.on(() => {
      // Snapshot is read on every event; no rerender hook needed today.
    });
    if (mod.fileId) {
      void tryAutoStart(mod);
    }
  },
  unmount() {
    document.removeEventListener("click", onClickCapture, true);
    autoStartAttempted.clear();
    lastKnownContext = null;
    if (unsubscribeSettings) {
      unsubscribeSettings();
      unsubscribeSettings = null;
    }
    clearContent();
  },
};
