import { describe, it, expect } from 'vitest';
import { PRESETS } from '../../src/options/presets.js';
import { PRESET_PROFILES } from '../../src/shared/constants.js';

describe('Presets', () => {
  it('defines all 4 core preset profiles', () => {
    expect(PRESETS[PRESET_PROFILES.SOLO_MODDER]).toBeDefined();
    expect(PRESETS[PRESET_PROFILES.COLLECTION_HOARDER]).toBeDefined();
    expect(PRESETS[PRESET_PROFILES.FREE_TIER]).toBeDefined();
    expect(PRESETS[PRESET_PROFILES.MO2_POWER_USER]).toBeDefined();
  });

  it('configures Collection Hoarder for high throughput', () => {
    const hoarder = PRESETS[PRESET_PROFILES.COLLECTION_HOARDER];
    expect(hoarder.settings.maxConcurrentDownloads).toBe(4);
    expect(hoarder.settings.retryAttempts).toBe(5);
    expect(hoarder.settings.collectionDownloadMethod).toBe(1);
  });

  it('configures Free-Tier for gentle safety', () => {
    const free = PRESETS[PRESET_PROFILES.FREE_TIER];
    expect(free.settings.maxConcurrentDownloads).toBe(1);
    expect(free.settings.collectionPauseBetweenDownload).toBe(3.0);
  });

  it('configures MO2 Power User for .meta generation', () => {
    const mo2 = PRESETS[PRESET_PROFILES.MO2_POWER_USER];
    expect(mo2.settings.generateMo2Meta).toBe(true);
  });
});
