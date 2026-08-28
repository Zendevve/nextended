import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  initializePageShield,
  createStatisticsStub,
  ensureStatisticsStub
} from '../../src/content/pageShield';

describe('pageShield', () => {
  beforeEach(() => {
    delete (window as unknown as Record<string, unknown>).__nextended_shield_active;
    delete (window as unknown as Record<string, unknown>)._mixpanelFirePageview;
    delete (window as unknown as Record<string, unknown>).mixpanel;
    delete (window as unknown as Record<string, unknown>).statistics;
    delete (window as unknown as Record<string, unknown>).ramp;
    delete (window as unknown as Record<string, unknown>).Nexus;
    delete (window as unknown as Record<string, unknown>).user;
    delete (window as unknown as Record<string, unknown>).analytics;
    delete (window as unknown as Record<string, unknown>)._qevents;
    delete (window as unknown as Record<string, unknown>)._quantgc;
    delete (window as unknown as Record<string, unknown>).quantserve;
    delete (window as unknown as Record<string, unknown>).pSUPERFLY;
    delete (window as unknown as Record<string, unknown>).dataLayer;
    delete (window as unknown as Record<string, unknown>).gtag;
    delete (window as unknown as Record<string, unknown>).ga;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('idempotent: subsequent calls do not re-patch', () => {
    initializePageShield();
    initializePageShield();
    expect((window as unknown as Record<string, unknown>).__nextended_shield_active).toBe(true);
  });

  it('createStatisticsStub creates a comprehensive no-op tracking stub', async () => {
    const stub = createStatisticsStub();
    expect(typeof stub.track).toBe('function');
    expect(typeof stub.send).toBe('function');
    expect(typeof stub.log).toBe('function');
    expect(typeof stub.event).toBe('function');
    expect(typeof stub.page).toBe('function');
    expect(typeof stub.pageview).toBe('function');
    expect(typeof stub.record).toBe('function');
    expect(typeof stub.push).toBe('function');
    expect(typeof stub.identify).toBe('function');
    expect(typeof stub.set).toBe('function');
    expect(typeof stub.get).toBe('function');
    expect(typeof stub.flush).toBe('function');
    expect(stub.data).toEqual({});
    expect(stub.queue).toEqual([]);

    expect((stub.track as (ev: string, data?: unknown) => void)('download', { id: 1 })).toBeUndefined();
    expect((stub.get as (k: string) => unknown)('key')).toBeUndefined();
    await expect((stub.flush as () => Promise<void>)()).resolves.toBeUndefined();
  });

  it('ensureStatisticsStub handles missing and partially existing stubs', () => {
    const target: Record<string, unknown> = {
      statistics: {
        customProp: 'custom',
        track: vi.fn()
      }
    };
    ensureStatisticsStub(target, 'statistics');
    const stats = target.statistics as Record<string, unknown>;
    expect(stats.customProp).toBe('custom');
    expect(typeof stats.send).toBe('function');
    expect(typeof stats.track).toBe('function');
  });

  it('patches mixpanel stub when missing', () => {
    initializePageShield();
    const w = window as unknown as Record<string, unknown>;
    expect(typeof w._mixpanelFirePageview).toBe('function');
    expect((w._mixpanelFirePageview as () => void)()).toBeUndefined();
    expect(w.mixpanel).toBeDefined();
    const mp = w.mixpanel as Record<string, unknown>;
    expect(typeof mp.track).toBe('function');
    const people = mp.people as Record<string, unknown>;
    expect(typeof people.set).toBe('function');
    expect((mp.get_distinct_id as () => string)()).toBe('anonymous');
  });

  it('preserves existing mixpanel when present', () => {
    const realTrack = vi.fn();
    (window as unknown as Record<string, unknown>).mixpanel = { track: realTrack };
    initializePageShield();
    const mp = (window as unknown as Record<string, unknown>).mixpanel as Record<string, unknown>;
    expect(mp.track).toBe(realTrack);
  });

  it('patches statistics and ramp stubs including ramp.statistics', () => {
    initializePageShield();
    const w = window as unknown as Record<string, unknown>;
    const stats = w.statistics as Record<string, unknown>;
    expect(stats).toBeDefined();
    expect(typeof stats.track).toBe('function');
    expect(typeof stats.send).toBe('function');

    const ramp = w.ramp as Record<string, unknown>;
    expect(ramp).toBeDefined();
    expect(ramp.passiveMode).toBe(true);
    expect(typeof ramp.on).toBe('function');
    expect(typeof ramp.addTag).toBe('function');
    expect(typeof ramp.setPixel).toBe('function');
    expect(typeof ramp.getPixel).toBe('function');

    const rampStats = ramp.statistics as Record<string, unknown>;
    expect(rampStats).toBeDefined();
    expect(typeof rampStats.track).toBe('function');
    expect(typeof rampStats.send).toBe('function');
  });

  it('preserves existing ramp properties while patching missing ramp.statistics', () => {
    const customFn = vi.fn();
    (window as unknown as Record<string, unknown>).ramp = {
      passiveMode: false,
      customMethod: customFn
    };
    initializePageShield();
    const ramp = (window as unknown as Record<string, unknown>).ramp as Record<string, unknown>;
    expect(ramp.passiveMode).toBe(false);
    expect(ramp.customMethod).toBe(customFn);
    expect(ramp.statistics).toBeDefined();
    const rampStats = ramp.statistics as Record<string, unknown>;
    expect(typeof rampStats.track).toBe('function');
  });

  it('patches Nexus namespace stub with Nexus.statistics, Analytics, and Tracking', () => {
    initializePageShield();
    const w = window as unknown as Record<string, unknown>;
    expect(w.Nexus).toBeDefined();
    const nexus = w.Nexus as Record<string, unknown>;
    expect(nexus.statistics).toBeDefined();
    expect(typeof (nexus.statistics as Record<string, unknown>).track).toBe('function');
    expect(nexus.Analytics).toBeDefined();
    expect(typeof (nexus.Analytics as Record<string, unknown>).track).toBe('function');
    expect(nexus.Tracking).toBeDefined();
    expect(typeof (nexus.Tracking as Record<string, unknown>).track).toBe('function');
    expect(nexus.Ads).toBeDefined();
    expect(typeof (nexus.Ads as Record<string, unknown>).init).toBe('function');
  });

  it('preserves existing Nexus properties while ensuring Nexus.statistics is attached', () => {
    (window as unknown as Record<string, unknown>).Nexus = {
      version: '2.5.0',
      customFeature: true
    };
    initializePageShield();
    const nexus = (window as unknown as Record<string, unknown>).Nexus as Record<string, unknown>;
    expect(nexus.version).toBe('2.5.0');
    expect(nexus.customFeature).toBe(true);
    expect(nexus.statistics).toBeDefined();
    expect(typeof (nexus.statistics as Record<string, unknown>).track).toBe('function');
  });

  it('patches user stub with user.statistics without clobbering existing user properties', () => {
    (window as unknown as Record<string, unknown>).user = {
      userId: 12345,
      is_premium: true,
      name: 'Dragonborn'
    };
    initializePageShield();
    const user = (window as unknown as Record<string, unknown>).user as Record<string, unknown>;
    expect(user.userId).toBe(12345);
    expect(user.is_premium).toBe(true);
    expect(user.name).toBe('Dragonborn');
    expect(user.statistics).toBeDefined();
    expect(typeof (user.statistics as Record<string, unknown>).track).toBe('function');
  });

  it('patches analytics stub with analytics.statistics and core methods', () => {
    initializePageShield();
    const w = window as unknown as Record<string, unknown>;
    expect(w.analytics).toBeDefined();
    const analytics = w.analytics as Record<string, unknown>;
    expect(typeof analytics.track).toBe('function');
    expect(typeof analytics.page).toBe('function');
    expect(typeof analytics.identify).toBe('function');
    expect(analytics.statistics).toBeDefined();
    expect(typeof (analytics.statistics as Record<string, unknown>).track).toBe('function');

    const readyCb = vi.fn();
    (analytics.ready as (cb: () => void) => void)(readyCb);
    expect(readyCb).toHaveBeenCalled();
  });

  it('patches quantserve and Google Analytics globals when missing', () => {
    initializePageShield();
    const w = window as unknown as Record<string, unknown>;
    expect(w._qevents).toEqual([]);
    expect(typeof w._quantgc).toBe('function');
    expect(typeof w.quantserve).toBe('function');
    expect(w.pSUPERFLY).toBeDefined();
    expect(typeof (w.pSUPERFLY as Record<string, unknown>).virtualPage).toBe('function');

    expect(Array.isArray(w.dataLayer)).toBe(true);
    expect(typeof w.gtag).toBe('function');
    expect(typeof w.ga).toBe('function');
  });

  it('registers window error listener that prevents default for statistics and ad blocker errors', () => {
    initializePageShield();

    const evt = new Event('error', { cancelable: true }) as unknown as {
      message: string;
      error: Error;
      filename: string;
      preventDefault: () => void;
      stopImmediatePropagation: () => void;
    };
    evt.message = "Uncaught TypeError: Cannot read properties of undefined (reading 'statistics')";
    evt.error = new TypeError("Cannot read properties of undefined (reading 'statistics')");
    evt.filename = 'https://nexusmods.com/assets/scripts/main.js';
    evt.preventDefault = vi.fn();
    evt.stopImmediatePropagation = vi.fn();

    window.dispatchEvent(evt as unknown as Event);
    expect(evt.preventDefault).toHaveBeenCalled();
    expect(evt.stopImmediatePropagation).toHaveBeenCalled();
  });

  it('suppresses ramp and blocked client errors in window error listener', () => {
    initializePageShield();

    const evt = new Event('error', { cancelable: true }) as unknown as {
      message: string;
      error: Error;
      filename: string;
      preventDefault: () => void;
      stopImmediatePropagation: () => void;
    };
    evt.message = 'net::ERR_BLOCKED_BY_CLIENT';
    evt.error = new Error('Script blocked by client');
    evt.filename = 'https://cdn.intergient.com/ramp.js';
    evt.preventDefault = vi.fn();
    evt.stopImmediatePropagation = vi.fn();

    window.dispatchEvent(evt as unknown as Event);
    expect(evt.preventDefault).toHaveBeenCalled();
    expect(evt.stopImmediatePropagation).toHaveBeenCalled();
  });

  it('does not suppress unrelated errors in window error listener', () => {
    initializePageShield();

    const evt = new Event('error', { cancelable: true }) as unknown as {
      message: string;
      error: Error;
      filename: string;
      preventDefault: () => void;
      stopImmediatePropagation: () => void;
    };
    evt.message = 'Uncaught ReferenceError: someAppVariable is not defined';
    evt.error = new ReferenceError('someAppVariable is not defined');
    evt.filename = 'https://nexusmods.com/custom.js';
    evt.preventDefault = vi.fn();
    evt.stopImmediatePropagation = vi.fn();

    window.dispatchEvent(evt as unknown as Event);
    expect(evt.preventDefault).not.toHaveBeenCalled();
    expect(evt.stopImmediatePropagation).not.toHaveBeenCalled();
  });

  it('does not call preventDefault on unrelated unhandledrejection when matching pattern is absent', () => {
    initializePageShield();
    const evt = new Event('unhandledrejection', { cancelable: true }) as unknown as {
      reason?: unknown;
      preventDefault: () => void;
    };
    evt.reason = new Error('unrelated failure');
    evt.preventDefault = vi.fn();
    window.dispatchEvent(evt as unknown as Event);
    expect(evt.preventDefault).not.toHaveBeenCalled();
  });

  it('calls preventDefault on unhandledrejection with statistics or ramp rejection', () => {
    initializePageShield();
    const evt = new Event('unhandledrejection', { cancelable: true }) as unknown as {
      reason?: unknown;
      preventDefault: () => void;
    };
    evt.reason = new TypeError("Cannot read properties of undefined (reading 'statistics')");
    evt.preventDefault = vi.fn();
    window.dispatchEvent(evt as unknown as Event);
    expect(evt.preventDefault).toHaveBeenCalled();
  });

  it('calls preventDefault on unhandledrejection with Document not active', () => {
    initializePageShield();
    const evt = new Event('unhandledrejection', { cancelable: true }) as unknown as {
      reason?: unknown;
      preventDefault: () => void;
    };
    evt.reason = new TypeError("Failed to execute 'exitFullscreen' on 'Document': Document not active");
    evt.preventDefault = vi.fn();
    window.dispatchEvent(evt as unknown as Event);
    expect(evt.preventDefault).toHaveBeenCalled();
  });
});
