import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initializePageShield } from '../../src/content/pageShield';

describe('pageShield', () => {
  beforeEach(() => {
    delete (window as Record<string, unknown>).__nextended_shield_active;
    delete (window as Record<string, unknown>)._mixpanelFirePageview;
    delete (window as Record<string, unknown>).mixpanel;
    delete (window as Record<string, unknown>).statistics;
    delete (window as Record<string, unknown>).ramp;
    delete (window as Record<string, unknown>)._qevents;
    delete (window as Record<string, unknown>)._quantgc;
    delete (window as Record<string, unknown>).quantserve;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('idempotent: subsequent calls do not re-patch', () => {
    initializePageShield();
    initializePageShield();
    expect((window as Record<string, unknown>).__nextended_shield_active).toBe(true);
  });

  it('patches mixpanel stub when missing', () => {
    initializePageShield();
    const w = window as Record<string, unknown>;
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
    (window as Record<string, unknown>).mixpanel = { track: realTrack };
    initializePageShield();
    const mp = (window as Record<string, unknown>).mixpanel as Record<string, unknown>;
    expect(mp.track).toBe(realTrack);
  });

  it('patches statistics and ramp stubs when missing', () => {
    initializePageShield();
    const w = window as Record<string, unknown>;
    const stats = w.statistics as Record<string, unknown>;
    expect(stats).toBeDefined();
    expect(typeof stats.track).toBe('function');
    const ramp = w.ramp as Record<string, unknown>;
    expect(ramp).toBeDefined();
    expect(ramp.passiveMode).toBe(true);
  });

  it('patches quantserve globals when missing', () => {
    initializePageShield();
    const w = window as Record<string, unknown>;
    expect(w._qevents).toEqual([]);
    expect(typeof w._quantgc).toBe('function');
    expect(typeof w.quantserve).toBe('function');
  });

  it('registers an unhandledrejection listener that swallows fullscreen errors', () => {
    initializePageShield();
    const addSpy = vi.spyOn(window, 'addEventListener');
    initializePageShield();
    const addCalls = addSpy.mock.calls.filter((c) => c[0] === 'unhandledrejection');
    expect(addCalls.length).toBe(0);
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
