import { describe, it, expect } from 'vitest';
import { generateMo2MetaContent, createMo2MetaBlobUrl } from '../../src/background/mo2-meta-generator.js';

describe('MO2 Meta Generator', () => {
  it('generates valid INI meta format', () => {
    const item = {
      gameDomain: 'skyrimspecialedition',
      modId: '12604',
      fileId: '45021',
      fileVersion: '5.2SE',
      modName: 'SkyUI',
    };
    const content = generateMo2MetaContent(item);
    expect(content).toContain('[General]');
    expect(content).toContain('gameName=skyrimspecialedition');
    expect(content).toContain('modID=12604');
    expect(content).toContain('fileID=45021');
    expect(content).toContain('version=5.2SE');
    expect(content).toContain('modName=SkyUI');
  });

  it('creates base64 data URL', () => {
    const item = { modName: 'Test' };
    const url = createMo2MetaBlobUrl(item);
    expect(url).toMatch(/^data:text\/plain;charset=utf-8;base64,/);
  });
});
