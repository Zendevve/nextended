export function createStatisticsStub(): Record<string, unknown> {
  const noop = (): void => {};
  return {
    track: noop,
    send: noop,
    log: noop,
    event: noop,
    page: noop,
    pageview: noop,
    record: noop,
    push: noop,
    identify: noop,
    set: noop,
    get: () => undefined,
    flush: () => Promise.resolve(),
    data: {},
    queue: []
  };
}

export function ensureStatisticsStub(
  target: Record<string, unknown>,
  prop = "statistics"
): Record<string, unknown> {
  const current = target[prop];
  if (!current || typeof current !== "object") {
    const stub = createStatisticsStub();
    target[prop] = stub;
    return stub;
  }

  const existing = current as Record<string, unknown>;
  const fallback = createStatisticsStub();
  for (const key of Object.keys(fallback)) {
    if (existing[key] === undefined) {
      existing[key] = fallback[key];
    }
  }
  return existing;
}

function createRampStub(): Record<string, unknown> {
  const noop = (): void => {};
  return {
    queues: {} as Record<string, unknown[]>,
    passiveMode: true,
    on: noop,
    addTag: noop,
    setPixel: noop,
    getPixel: noop,
    clean: noop,
    trigger: noop,
    triggerRule: noop,
    addEvent: noop,
    destroy: noop,
    setTargeting: noop,
    forceDisplayUnit: noop,
    showAffiliateDisclaimer: noop,
    hideAffiliateDisclaimer: noop,
    config: {},
    services: {},
    displayUnits: {},
    statistics: createStatisticsStub()
  };
}

function patchRampStub(ramp: Record<string, unknown>): void {
  const noop = (): void => {};
  if (!ramp.queues) ramp.queues = {};
  if (ramp.passiveMode === undefined) ramp.passiveMode = true;
  if (typeof ramp.on !== "function") ramp.on = noop;
  if (typeof ramp.addTag !== "function") ramp.addTag = noop;
  if (typeof ramp.setPixel !== "function") ramp.setPixel = noop;
  if (typeof ramp.getPixel !== "function") ramp.getPixel = noop;
  if (typeof ramp.clean !== "function") ramp.clean = noop;
  if (typeof ramp.trigger !== "function") ramp.trigger = noop;
  if (typeof ramp.triggerRule !== "function") ramp.triggerRule = noop;
  if (typeof ramp.addEvent !== "function") ramp.addEvent = noop;
  if (typeof ramp.destroy !== "function") ramp.destroy = noop;
  if (typeof ramp.setTargeting !== "function") ramp.setTargeting = noop;
  if (typeof ramp.forceDisplayUnit !== "function") ramp.forceDisplayUnit = noop;
  if (typeof ramp.showAffiliateDisclaimer !== "function") ramp.showAffiliateDisclaimer = noop;
  if (typeof ramp.hideAffiliateDisclaimer !== "function") ramp.hideAffiliateDisclaimer = noop;
  if (!ramp.config) ramp.config = {};
  if (!ramp.services) ramp.services = {};
  if (!ramp.displayUnits) ramp.displayUnits = {};
  ensureStatisticsStub(ramp, "statistics");
}

function patchNexusStub(nexus: Record<string, unknown>): void {
  ensureStatisticsStub(nexus, "statistics");
  if (!nexus.Analytics || typeof nexus.Analytics !== "object") {
    nexus.Analytics = createStatisticsStub();
  } else {
    ensureStatisticsStub(nexus, "Analytics");
  }
  if (!nexus.Tracking || typeof nexus.Tracking !== "object") {
    nexus.Tracking = createStatisticsStub();
  } else {
    ensureStatisticsStub(nexus, "Tracking");
  }
  if (!nexus.Ads || typeof nexus.Ads !== "object") {
    const noop = (): void => {};
    nexus.Ads = { init: noop, refresh: noop, destroy: noop };
  }
}

function createAnalyticsStub(): Record<string, unknown> {
  const noop = (): void => {};
  return {
    track: noop,
    page: noop,
    identify: noop,
    group: noop,
    alias: noop,
    ready: (cb?: () => void) => {
      if (typeof cb === "function") cb();
    },
    load: noop,
    reset: noop,
    push: noop,
    statistics: createStatisticsStub()
  };
}

function patchAnalyticsStub(analytics: Record<string, unknown>): void {
  const noop = (): void => {};
  if (typeof analytics.track !== "function") analytics.track = noop;
  if (typeof analytics.page !== "function") analytics.page = noop;
  if (typeof analytics.identify !== "function") analytics.identify = noop;
  if (typeof analytics.group !== "function") analytics.group = noop;
  if (typeof analytics.alias !== "function") analytics.alias = noop;
  if (typeof analytics.ready !== "function") {
    analytics.ready = (cb?: () => void) => {
      if (typeof cb === "function") cb();
    };
  }
  if (typeof analytics.load !== "function") analytics.load = noop;
  if (typeof analytics.reset !== "function") analytics.reset = noop;
  if (typeof analytics.push !== "function") analytics.push = noop;
  ensureStatisticsStub(analytics, "statistics");
}

function extractErrorMessage(err: unknown): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  if (typeof err === "object" && "message" in err && typeof err.message === "string") {
    return err.message;
  }
  return String(err);
}

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
    const globalObj = globalThis as { Document?: typeof Document };
    const docProto = globalObj.Document?.prototype ?? (typeof document !== "undefined" ? Object.getPrototypeOf(document) : undefined);
    if (docProto && typeof docProto.exitFullscreen === "function") {
      const origExitFullscreen = docProto.exitFullscreen;
      docProto.exitFullscreen = function (this: Document, ...args: unknown[]) {
        try {
          if (!this.fullscreenElement) return Promise.resolve();
          const result = origExitFullscreen.apply(this, args);
          if (result && typeof result === "object" && "catch" in result && typeof result.catch === "function") {
            return result.catch(() => Promise.resolve());
          }
          return Promise.resolve(result);
        } catch {
          return Promise.resolve();
        }
      };
    } else if (typeof document !== "undefined" && typeof document.exitFullscreen === "function") {
      const origExitFullscreen = document.exitFullscreen.bind(document);
      document.exitFullscreen = function (this: Document) {
        try {
          if (!this.fullscreenElement) return Promise.resolve();
          const result = origExitFullscreen();
          if (result && typeof result === "object" && "catch" in result && typeof result.catch === "function") {
            return result.catch(() => Promise.resolve());
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

  // 3. Comprehensive Statistics, RAMP, Nexus, User, Analytics, & Quantserve stubs
  ensureStatisticsStub(win, "statistics");

  // RAMP stub (Playwire / Publisher ad stack)
  if (!win.ramp || typeof win.ramp !== "object") {
    win.ramp = createRampStub();
  } else {
    patchRampStub(win.ramp as Record<string, unknown>);
  }

  // Nexus namespace stub (Nexus Mods site scripts)
  if (!win.Nexus || typeof win.Nexus !== "object") {
    win.Nexus = {};
  }
  patchNexusStub(win.Nexus as Record<string, unknown>);

  // user object stub (Nexus user session / telemetry)
  if (!win.user || typeof win.user !== "object") {
    win.user = {};
  }
  ensureStatisticsStub(win.user as Record<string, unknown>, "statistics");

  // analytics stub
  if (!win.analytics || typeof win.analytics !== "object") {
    win.analytics = createAnalyticsStub();
  } else {
    patchAnalyticsStub(win.analytics as Record<string, unknown>);
  }

  // Quantserve stubs
  if (!win._qevents) {
    win._qevents = [] as unknown[];
  }
  if (typeof win._quantgc !== "function") {
    win._quantgc = () => {};
  }
  if (typeof win.quantserve !== "function") {
    win.quantserve = () => {};
  }
  if (!win.pSUPERFLY || typeof win.pSUPERFLY !== "object") {
    win.pSUPERFLY = {
      virtualPage: () => {},
      activity: () => {}
    };
  }

  // Google Analytics / GTM stubs
  if (!Array.isArray(win.dataLayer)) {
    win.dataLayer = [];
  }
  if (typeof win.gtag !== "function") {
    win.gtag = () => {};
  }
  if (typeof win.ga !== "function") {
    win.ga = () => {};
  }

  // 4. Global window error listener for ad blocker & telemetry error suppression
  window.addEventListener(
    "error",
    (event: ErrorEvent) => {
      const msg = String(event?.message ?? "");
      const errorMsg = extractErrorMessage(event?.error);
      const filename = String(event?.filename ?? "");
      const combined = `${msg} ${errorMsg} ${filename}`.toLowerCase();

      if (
        combined.includes("statistics") ||
        combined.includes("ramp") ||
        combined.includes("mixpanel") ||
        combined.includes("quantserve") ||
        combined.includes("quantgc") ||
        combined.includes("psuperfly") ||
        combined.includes("err_blocked_by_client") ||
        combined.includes("document not active") ||
        combined.includes("failed to execute 'exitfullscreen'")
      ) {
        event.preventDefault();
        if (typeof event.stopImmediatePropagation === "function") {
          event.stopImmediatePropagation();
        }
      }
    },
    true
  );

  // 5. Global unhandledrejection listener for document / tracking rejection suppression
  window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
    if (!event?.reason) return;
    const reasonStr = extractErrorMessage(event.reason);
    if (
      reasonStr.includes("Failed to execute 'exitFullscreen'") ||
      reasonStr.includes("Document not active") ||
      reasonStr.includes("_mixpanelFirePageview") ||
      reasonStr.includes("mixpanel") ||
      reasonStr.includes("statistics") ||
      reasonStr.includes("ramp") ||
      reasonStr.includes("quantserve") ||
      reasonStr.includes("pSUPERFLY") ||
      reasonStr.includes("net::ERR_BLOCKED_BY_CLIENT") ||
      reasonStr.includes("ERR_BLOCKED_BY_CLIENT")
    ) {
      event.preventDefault();
    }
  });
}

function ensureMixpanelStub(win: Record<string, unknown>): void {
  const current = win.mixpanel;
  if (current && typeof current === "object" && "track" in current && typeof current.track === "function") {
    return;
  }
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
