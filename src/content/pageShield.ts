export function initializePageShield(): void {
  if (typeof window === "undefined") return;

  const win = window as unknown as Record<string, unknown>;
  if (win.__nextended_shield_active) return;
  win.__nextended_shield_active = true;

  // 1. Safe Document.prototype.exitFullscreen shim
  //    Prevents "Failed to execute 'exitFullscreen' on 'Document': Document not active"
  //    that surfaces when ad blocker interference or PhotoSwipe destroy() runs
  //    while the document is in an inactive state.
  try {
    const DocumentCtor = (globalThis as { Document?: typeof Document }).Document;
    const docProto = (DocumentCtor?.prototype as Document | undefined) ?? (typeof document !== "undefined" ? (Object.getPrototypeOf(document) as Document) : undefined);
    if (docProto && typeof docProto.exitFullscreen === "function") {
      const origExitFullscreen = docProto.exitFullscreen;
      docProto.exitFullscreen = function (this: Document, ...args: unknown[]) {
        try {
          if (!this.fullscreenElement) return Promise.resolve();
          const result = origExitFullscreen.apply(this, args);
          if (result && typeof (result as Promise<unknown>).catch === "function") {
            return (result as Promise<unknown>).catch(() => Promise.resolve());
          }
          return Promise.resolve(result);
        } catch {
          return Promise.resolve();
        }
      };
    } else if (typeof document !== "undefined" && typeof document.exitFullscreen === "function") {
      const origExitFullscreen = document.exitFullscreen.bind(document);
      document.exitFullscreen = function (this: Document, ...args: unknown[]) {
        try {
          if (!this.fullscreenElement) return Promise.resolve();
          const result = origExitFullscreen(...args);
          if (result && typeof (result as Promise<unknown>).catch === "function") {
            return (result as Promise<unknown>).catch(() => Promise.resolve());
          }
          return Promise.resolve(result);
        } catch {
          return Promise.resolve();
        }
      };
    }
  } catch {}

  // 2. Mixpanel stub
  if (typeof win._mixpanelFirePageview !== "function") {
    win._mixpanelFirePageview = () => {};
  }
  ensureMixpanelStub(win);

  // 3. Quantserve & RAMP & statistics stubs
  if (!win.statistics) {
    win.statistics = {
      track: () => {},
      send: () => {},
      log: () => {},
      data: {}
    };
  }
  if (!win.ramp) {
    win.ramp = {
      queues: {} as Record<string, unknown[]>,
      passiveMode: true,
      on: () => {},
      addTag: () => {},
      setPixel: () => {},
      getPixel: () => {},
      clean: () => {},
      trigger: () => {}
    };
  }
  if (!win._qevents) {
    win._qevents = [] as unknown[];
  }
  if (typeof win._quantgc !== "function") {
    win._quantgc = () => {};
  }
  if (typeof win.quantserve !== "function") {
    win.quantserve = () => {};
  }

  // 4. Global unhandledrejection listener for document / tracking rejection suppression
  window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
    if (!event?.reason) return;
    const reasonStr = String((event.reason as { message?: string })?.message ?? event.reason);
    if (
      reasonStr.includes("Failed to execute 'exitFullscreen'") ||
      reasonStr.includes("Document not active") ||
      reasonStr.includes("_mixpanelFirePageview") ||
      reasonStr.includes("mixpanel") ||
      reasonStr.includes("statistics") ||
      reasonStr.includes("net::ERR_BLOCKED_BY_CLIENT")
    ) {
      event.preventDefault();
    }
  });
}

function ensureMixpanelStub(win: Record<string, unknown>): void {
  if (win.mixpanel && typeof (win.mixpanel as { track?: unknown }).track === "function") return;
  const noop = (): void => {};
  const noopObj = {
    set: noop,
    set_once: noop,
    unset: noop,
    increment: noop,
    append: noop,
    union: noop,
    track_charge: noop,
    clear_charges: noop,
    delete_user: noop
  };
  const mp = (win.mixpanel = (win.mixpanel as Record<string, unknown>) ?? {});
  mp.init = noop;
  mp.track = noop;
  mp.track_links = noop;
  mp.track_forms = noop;
  mp.time_event = noop;
  mp.register = noop;
  mp.register_once = noop;
  mp.unregister = noop;
  mp.identify = noop;
  mp.reset = noop;
  mp.get_distinct_id = () => "anonymous";
  mp.people = noopObj;
  mp.push = noop;
}

if (typeof window !== "undefined") {
  initializePageShield();
}
