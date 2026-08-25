// src/content/ui/root.ts — the single shadow-rooted host element per page
// (`<nextended-root>`). Other UI components render inside its shadow root.

const HOST_TAG = "nextended-root";
const STYLE_ID = "nextended-style";

const ROOT_CSS = `
  :host { all: initial; }
  * { box-sizing: border-box; font: 13px/1.4 system-ui, sans-serif; color: #e6e6e6; }
  button { font: inherit; }
  a { color: #da8e35; }
  .nx-panel { background: #1f1f23; border: 1px solid #2c2c30; border-radius: 6px; padding: 10px; }
  .nx-row { display: flex; gap: 8px; align-items: center; }
  .nx-btn { background: #2b2b30; color: #e6e6e6; border: 1px solid #3a3a40; border-radius: 4px; padding: 4px 10px; cursor: pointer; }
  .nx-btn:hover { background: #353539; }
  .nx-btn-primary { background: #da8e35; border-color: #da8e35; color: #1a1a1a; }
  .nx-btn-primary:hover { background: #e89a47; }
  .nx-muted { color: #999; }
  .nx-error { color: #ff6b6b; }
  .nx-toast { position: fixed; right: 12px; bottom: 12px; background: #1f1f23; border: 1px solid #2c2c30; border-radius: 6px; padding: 8px 10px; min-width: 220px; }
  .nx-log { font-family: ui-monospace, monospace; font-size: 12px; max-height: 16rem; overflow: auto; }
  .nx-log-row { padding: 2px 0; }
  .nx-log-row.nx-error { color: #ff6b6b; }
  .nx-progress { height: 6px; background: #2b2b30; border-radius: 3px; overflow: hidden; }
  .nx-progress > span { display: block; height: 100%; background: #da8e35; }
`;

export interface HostHandle {
  host: HTMLElement;
  shadow: ShadowRoot;
  mount<T>(root: () => T): T;
}

let current: HostHandle | null = null;

/** Get-or-create the host element under <body>. Idempotent. */
export function ensureHost(): HostHandle {
  if (current) return current;
  const host = document.createElement(HOST_TAG);
  host.style.position = "fixed";
  host.style.bottom = "0";
  host.style.right = "0";
  host.style.zIndex = "2147483646";
  host.style.pointerEvents = "auto";
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = ROOT_CSS;
  shadow.appendChild(style);
  const root = document.createElement("div");
  root.id = "nextended-root-content";
  shadow.appendChild(root);
  (document.body ?? document.documentElement).appendChild(host);
  current = { host, shadow, mount: <T,>(fn: () => T): T => fn() };
  return current;
}

export function removeHost(): void {
  if (!current) return;
  current.host.remove();
  current = null;
}

export function withContent<T>(fn: (container: HTMLElement) => T): T {
  const { shadow } = ensureHost();
  const container = shadow.getElementById("nextended-root-content") as HTMLElement | null;
  if (!container) throw new Error("[Nextended] shadow content container missing");
  return fn(container);
}

export function clearContent(): void {
  const { shadow } = ensureHost();
  const container = shadow.getElementById("nextended-root-content");
  if (container) container.replaceChildren();
}
