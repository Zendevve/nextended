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
    expect(hoarder.settings.collectionDownloadMethod).toBe(1);
    expect(hoarder.settings.collectionPauseBetweenDownload).toBe(1.0);
    expect(hoarder.settings.collectionSafetyPause).toBe(true);
  });

  it('configures Free-Tier for gentle safety', () => {
    const free = PRESETS[PRESET_PROFILES.FREE_TIER];
    expect(free.settings.collectionPauseBetweenDownload).toBe(5.0);
    expect(free.settings.collectionSafetyPause).toBe(true);
  });

  it('configures MO2 Power User for NXM dispatch', () => {
    const mo2 = PRESETS[PRESET_PROFILES.MO2_POWER_USER];
    expect(mo2.settings.forceModManagerDownload).toBe(true);
    expect(mo2.settings.collectionDownloadMethod).toBe(0);
  });
});
