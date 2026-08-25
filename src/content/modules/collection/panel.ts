// src/content/modules/collection/panel.ts — collection-page panel UI.
// Mounted by the collection module into the shadow root.

import { withContent, clearContent } from "../../../content/ui/root.js";
import type { EngineEvent } from "./engine.js";
import type { CollectionEngine } from "./engine.js";
import type {
  BulkRun,
  QueueItem,
  RunType,
} from "../../../core/types.js";

export interface PanelHandlers {
  start: (runType: RunType) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  skipPause: () => void;
  setCursor: (i: number) => void;
  setMode: (mode: BulkRun["mode"]) => void;
}

export function mountPanel(
  engine: CollectionEngine,
  handlers: PanelHandlers,
  initial: { run: BulkRun | null; items: QueueItem[] },
): () => void {
  const unsub = engine.on((event) => renderPanel(engine, handlers, event, initial));
  // initial render
  renderPanel(engine, handlers, { kind: "state", run: initial.run ?? defaultRun() }, initial);
  return () => {
    unsub();
    clearContent();
  };
}

function defaultRun(): BulkRun {
  return {
    runId: "",
    gameDomain: "",
    collectionSlug: "",
    revision: null,
    runType: "all",
    mode: "vortex",
    itemKeys: [],
    cursor: 0,
    engine: "idle",
    startedAt: 0,
    updatedAt: 0,
  };
}

function renderPanel(
  engine: CollectionEngine,
  handlers: PanelHandlers,
  event: EngineEvent,
  _initial: { run: BulkRun | null; items: QueueItem[] },
): void {
  const snap = engine.snapshot();
  const run = snap.run ?? defaultRun();
  withContent((container) => {
    container.replaceChildren();
    container.appendChild(buildHeader(run, handlers));
    if (event.kind === "state" && run.engine === "running" && snap.items.length > 0) {
      container.appendChild(buildRunView(run, snap.items, handlers));
    } else if (event.kind === "state" && run.engine === "paused") {
      container.appendChild(buildRunView(run, snap.items, handlers));
    } else if (event.kind === "state" && run.engine === "stopped" && snap.items.length > 0) {
      container.appendChild(buildRunView(run, snap.items, handlers));
    } else {
      container.appendChild(buildIdleView(snap.items, handlers));
    }
    const logEntries = recentLogs(engine, 30);
    container.appendChild(buildLog(logEntries));
  });
}

function buildHeader(run: BulkRun, handlers: PanelHandlers): HTMLElement {
  const header = document.createElement("div");
  header.className = "nx-row";
  header.style.marginBottom = "6px";
  const modeSelect = document.createElement("select");
  for (const m of ["vortex", "browser"] as const) {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m === "vortex" ? "Vortex" : "Browser";
    if (m === run.mode) opt.selected = true;
    modeSelect.appendChild(opt);
  }
  modeSelect.addEventListener("change", () => {
    handlers.setMode((modeSelect.value as BulkRun["mode"]));
  });
  header.appendChild(modeSelect);
  return header;
}

function buildIdleView(items: QueueItem[], handlers: PanelHandlers): HTMLElement {
  const view = document.createElement("div");
  view.className = "nx-panel";
  const counts = countByClass(items);
  view.appendChild(makeBtn(`Download all (${counts.all})`, "nx-btn nx-btn-primary", () => handlers.start("all")));
  view.appendChild(makeBtn(`Mandatory only (${counts.mandatory})`, "nx-btn", () => handlers.start("mandatory")));
  view.appendChild(makeBtn(`Optional only (${counts.optional})`, "nx-btn", () => handlers.start("optional")));
  view.appendChild(makeBtn("Select…", "nx-btn", () => handlers.start("custom")));
  return view;
}

function buildRunView(
  run: BulkRun,
  items: QueueItem[],
  handlers: PanelHandlers,
): HTMLElement {
  const view = document.createElement("div");
  view.className = "nx-panel";
  const total = items.length;
  const cursor = Math.min(run.cursor, total);
  const pct = total === 0 ? 0 : Math.floor((cursor / total) * 100);
  const label = document.createElement("div");
  label.textContent = `${pct}% · ${cursor}/${total} · ${run.engine}`;
  view.appendChild(label);
  const bar = document.createElement("div");
  bar.className = "nx-progress";
  const fill = document.createElement("span");
  fill.style.width = `${pct}%`;
  bar.appendChild(fill);
  view.appendChild(bar);
  const row = document.createElement("div");
  row.className = "nx-row";
  row.style.marginTop = "6px";
  if (run.engine === "running") {
    row.appendChild(makeBtn("Pause", "nx-btn", handlers.pause));
  } else if (run.engine === "paused") {
    row.appendChild(makeBtn("Resume", "nx-btn nx-btn-primary", handlers.resume));
  }
  row.appendChild(makeBtn("Stop", "nx-btn", handlers.stop));
  row.appendChild(makeBtn("Skip pause", "nx-btn", handlers.skipPause));
  const input = document.createElement("input");
  input.type = "number";
  input.min = "1";
  input.max = String(total);
  input.placeholder = "Skip to #";
  input.style.width = "70px";
  input.addEventListener("change", () => {
    const v = Number(input.value);
    if (Number.isFinite(v)) handlers.setCursor(v);
  });
  row.appendChild(input);
  view.appendChild(row);
  return view;
}

function buildLog(entries: { ts: number; level: string; message: string }[]): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "nx-panel";
  wrap.style.marginTop = "8px";
  const title = document.createElement("div");
  title.className = "nx-muted";
  title.textContent = "Log";
  wrap.appendChild(title);
  const log = document.createElement("div");
  log.className = "nx-log";
  for (const e of entries) {
    const row = document.createElement("div");
    row.className = `nx-log-row ${e.level === "error" ? "nx-error" : ""}`;
    const time = new Date(e.ts).toLocaleTimeString();
    row.textContent = `${time}  ${e.message}`;
    log.appendChild(row);
  }
  wrap.appendChild(log);
  return wrap;
}

function makeBtn(text: string, cls: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = cls;
  b.textContent = text;
  b.style.marginRight = "6px";
  b.addEventListener("click", onClick);
  return b;
}

function countByClass(items: readonly QueueItem[]): { all: number; mandatory: number; optional: number } {
  let mandatory = 0;
  let optional = 0;
  for (const i of items) {
    if (i.optional) optional += 1;
    else mandatory += 1;
  }
  return { all: items.length, mandatory, optional };
}

function recentLogs(engine: CollectionEngine, limit: number): { ts: number; level: string; message: string }[] {
  const out: { ts: number; level: string; message: string }[] = [];
  engine.on((e) => {
    if (e.kind === "log") {
      out.push({ ts: e.entry.ts, level: e.entry.level, message: e.entry.message });
      if (out.length > limit) out.shift();
    }
  });
  return out;
}
