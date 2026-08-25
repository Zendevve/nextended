// src/content/settings-bridge.ts — live settings cache with subscription.
// The content script reads chrome.storage.local once, subscribes to onChanged,
// and exposes a synchronous snapshot to modules.

import { parseSettings, type Settings } from "../core/settings.js";

type Listener = (next: { kind: "settings" }) => void;

class SettingsBridge {
  private current: Settings | null = null;
  private listeners = new Set<Listener>();

  load(): Promise<Settings> {
    return new Promise((resolve) => {
      chrome.storage.local.get("nextended.v1.settings", (raw) => {
        const obj = (raw as Record<string, unknown>)["nextended.v1.settings"];
        const parsed = parseSettings(obj);
        const value: Settings = parsed ?? (parseSettings({}) as Settings);
        this.current = value;
        resolve(value);
      });
    });
  }

  start(): void {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      const c = changes["nextended.v1.settings"];
      if (!c) return;
      const next = parseSettings(c.newValue);
      if (next) {
        this.current = next;
        for (const l of this.listeners) l({ kind: "settings" });
      }
    });
  }

  snapshot(): Settings {
    if (!this.current) {
      // Synchronous fallback: load on first call, but never block. Modules
      // can refresh via the load() promise. For deterministic behaviour we
      // return the parsed defaults — they match PRD §2.4.
      this.current = parseSettings({}) as Settings;
    }
    return this.current;
  }

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export interface LiveSettings {
  snapshot(): Settings;
  on(listener: Listener): () => void;
}

export const settings: LiveSettings & { load: SettingsBridge["load"]; start: SettingsBridge["start"] } =
  new SettingsBridge() as never;
