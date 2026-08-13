import { describe, it, expect } from 'vitest';
import {
  urlMentionsRequirements,
  responseMentionsRequirements,
} from '../src/nexus/requirements.js';

describe('requirements', () => {
  it('detects requirements in URL paths', () => {
    expect(
      urlMentionsRequirements(
        'https://www.nexusmods.com/x/mods/42?tab=files&category=requirements'
      )
    ).toBe(true);
    expect(
      urlMentionsRequirements('https://www.nexusmods.com/x/mods/42/requirements')
    ).toBe(true);
    expect(urlMentionsRequirements('https://www.nexusmods.com/x/mods/42')).toBe(false);
  });

  it('detects requirements in response text', () => {
    expect(responseMentionsRequirements('This file has requirements')).toBe(true);
    expect(responseMentionsRequirements('dependencies:')).toBe(true);
    expect(responseMentionsRequirements('{"Data":{"URI":"ok"}}')).toBe(false);
  });
});
