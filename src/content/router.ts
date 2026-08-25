// src/content/router.ts — the single navigation detector per FR1.
// History-API hooks + popstate + ONE debounced MutationObserver (150 ms).
// Modules register { matches, mount, unmount } and the router diffs contexts.
import { parseRoute } from "../core/siteAdapters.js";
import type { PageContext } from "../core/types.js";
export interface Module<S> {
  matches(ctx: PageContext): boolean;
  mount(ctx: PageContext, state: S): Promise<void> | void;
  unmount(): Promise<void> | void;
  loadState?(): S;
}

interface Registered<S> {
  name: string;
  module: Module<S>;
}

export interface RouterOptions {
  url?: () => string;
  document?: Document;
  popstate?: (cb: () => void) => () => void;
  makeObserver?: (
    cb: () => void,
  ) => { observe: (target: Node, opts: { childList: true; subtree: true }) => void; disconnect: () => void };
}

const DEBOUNCE_MS = 150;

export class Router {
  private modules: Registered<unknown>[] = [];
  private currentCtx: PageContext = { kind: "other" };
  private currentName: string | null = null;
  private observer: { disconnect: () => void } | null = null;
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;
  private popstateOff: () => void = () => {};
  private historyPatched = false;

  constructor(private opts: RouterOptions = {}) {}

  register<S>(name: string, module: Module<S>): void {
    this.modules.push({ name, module: module as Module<unknown> });
  }

  start(): void {
    this.popstateOff = (this.opts.popstate ?? this.defaultPopstate())(() => {
      this.schedule();
    });
    this.installObserver();
    this.patchHistory();
    this.schedule();
  }

  stop(): void {
    this.popstateOff();
    this.observer?.disconnect();
    this.observer = null;
    if (this.pendingTimer) clearTimeout(this.pendingTimer);
    this.pendingTimer = null;
  }

  async evaluate(): Promise<void> {
    const url = (this.opts.url ?? (() => location.href))();
    const ctx = parseRoute(url);
    if (sameCtx(ctx, this.currentCtx) && this.currentName) return;
    if (this.currentName) {
      const prev = this.modules.find((m) => m.name === this.currentName);
      if (prev) await prev.module.unmount();
    }
    this.currentCtx = ctx;
    this.currentName = null;
    for (const m of this.modules) {
      if (m.module.matches(ctx)) {
        const state = m.module.loadState ? m.module.loadState() : undefined;
        await m.module.mount(ctx, state);
        this.currentName = m.name;
        break;
      }
    }
  }

  private schedule(): void {
    if (this.pendingTimer) clearTimeout(this.pendingTimer);
    this.pendingTimer = setTimeout(() => {
      this.pendingTimer = null;
      void this.evaluate();
    }, DEBOUNCE_MS);
  }

  private installObserver(): void {
    const makeObs =
      this.opts.makeObserver ??
      ((cb: () => void) => {
        const o = new MutationObserver(() => cb());
        return { observe: o.observe.bind(o), disconnect: o.disconnect.bind(o) };
      });
    const obs = makeObs(() => this.schedule());
    const doc = this.opts.document ?? document;
    obs.observe(doc.documentElement ?? doc.body, { childList: true, subtree: true });
    this.observer = obs;
  }

  private defaultPopstate(): (cb: () => void) => () => void {
    return (cb) => {
      const handler = () => cb();
      window.addEventListener("popstate", handler);
      return () => window.removeEventListener("popstate", handler);
    };
  }

  private patchHistory(): void {
    if (this.historyPatched) return;
    this.historyPatched = true;
    const wrap = (original: typeof history.pushState) =>
      function (this: History, ...args: Parameters<typeof history.pushState>) {
        const r = original.apply(this, args);
        window.dispatchEvent(new Event("nextended:locationchange"));
        return r;
      } as typeof history.pushState;
    history.pushState = wrap(history.pushState);
    history.replaceState = wrap(history.replaceState);
    window.addEventListener("nextended:locationchange", () => this.schedule());
  }
}

function sameCtx(a: PageContext, b: PageContext): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "collection":
      return (
        b.kind === "collection" &&
        a.gameDomain === b.gameDomain &&
        a.slug === b.slug &&
        a.revision === b.revision
      );
    case "mod":
      return (
        b.kind === "mod" &&
        a.gameDomain === b.gameDomain &&
        a.modId === b.modId &&
        a.fileId === b.fileId &&
        a.tab === b.tab
      );
    case "archived":
      return (
        b.kind === "archived" && a.gameDomain === b.gameDomain && a.modId === b.modId
      );
    case "other":
      return b.kind === "other";
  }
  return false;
}
