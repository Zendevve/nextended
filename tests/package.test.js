import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import {
  calculateCrc32,
  dosDateTime,
  createZipBuffer,
  computeSha256,
  collectDirectoryFiles,
  packageExtension,
} from '../scripts/package.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const SRC = join(ROOT, 'src');
function parseZipEntries(buf) {
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) throw new Error('EOCD signature not found in ZIP buffer');
  const cdCount = buf.readUInt16LE(eocdOffset + 10);
  const cdOffset = buf.readUInt32LE(eocdOffset + 16);

  let ptr = cdOffset;
  const files = [];
  for (let i = 0; i < cdCount; i++) {
    if (buf.readUInt32LE(ptr) !== 0x02014b50) throw new Error('Invalid Central Directory header');
    const method = buf.readUInt16LE(ptr + 10);
    const crc = buf.readUInt32LE(ptr + 16);
    const cSize = buf.readUInt32LE(ptr + 20);
    const uSize = buf.readUInt32LE(ptr + 24);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const lhOffset = buf.readUInt32LE(ptr + 42);
    const filename = buf.subarray(ptr + 46, ptr + 46 + nameLen).toString('utf8');

    if (buf.readUInt32LE(lhOffset) !== 0x04034b50) {
      throw new Error(`Invalid Local Header at offset ${lhOffset} for ${filename}`);
    }
    const lhNameLen = buf.readUInt16LE(lhOffset + 26);
    const lhExtraLen = buf.readUInt16LE(lhOffset + 28);
    const dataStart = lhOffset + 30 + lhNameLen + lhExtraLen;
    const compData = buf.subarray(dataStart, dataStart + cSize);

    const decompData = method === 8 ? inflateRawSync(compData) : compData;

    files.push({
      filename,
      compressedSize: cSize,
      uncompressedSize: uSize,
      method,
      crc,
      decompressed: decompData,
    });

    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

describe('Packaging & ZIP generation engine', () => {
  it('computes accurate CRC-32 checksums', () => {
    const testBuf = Buffer.from('123456789', 'utf8');
    const crc = calculateCrc32(testBuf);
    expect(crc.toString(16)).toBe('cbf43926');
  });

  it('converts Date to DOS time/date values properly', () => {
    const d = new Date(2026, 0, 15, 14, 30, 20);
    const { time, date } = dosDateTime(d);
    expect(time).toBeGreaterThan(0);
    expect(date).toBeGreaterThan(0);
  });

  it('generates valid, decompressable PKZIP buffers', () => {
    const entries = [
      {
        name: 'manifest.json',
        data: Buffer.from(JSON.stringify({ name: 'test', version: '1.0.0' }), 'utf8'),
        date: new Date(),
      },
      {
        name: 'nested/script.js',
        data: Buffer.from('console.log("testing nested zip paths");', 'utf8'),
        date: new Date(),
      },
    ];

    const zipBuf = createZipBuffer(entries);
    expect(zipBuf.subarray(0, 4).toString('hex')).toBe('504b0304');

    const parsed = parseZipEntries(zipBuf);
    expect(parsed.length).toBe(2);

    const manifestEntry = parsed.find((p) => p.filename === 'manifest.json');
    expect(manifestEntry).toBeDefined();
    expect(JSON.parse(manifestEntry.decompressed.toString('utf8')).name).toBe('test');

    const nestedEntry = parsed.find((p) => p.filename === 'nested/script.js');
    expect(nestedEntry).toBeDefined();
    expect(nestedEntry.decompressed.toString('utf8')).toContain('testing nested zip paths');
  });

  it('computes sha256 checksums correctly', () => {
    const buf = Buffer.from('nexus-mods-downloader-release', 'utf8');
    const hash = computeSha256(buf);
    expect(hash).toHaveLength(64);
  });
  it('collects files recursively from a directory', () => {
    const files = collectDirectoryFiles(SRC);
    expect(files.length).toBeGreaterThan(5);
    expect(files.some((f) => f.name.endsWith('nexus-content.js'))).toBe(true);
  });

  it('packages full extension distributions for chrome and firefox', async () => {
    const results = await packageExtension({ browsers: ['chrome', 'firefox'] });
    expect(results.length).toBe(2);

    for (const res of results) {
      expect(existsSync(res.path)).toBe(true);
      expect(res.sizeBytes).toBeGreaterThan(10000);
      expect(res.sha256).toHaveLength(64);

      const zipBuf = readFileSync(res.path);
      const parsed = parseZipEntries(zipBuf);

      // Verify root-level manifest.json
      const hasManifest = parsed.some((p) => p.filename === 'manifest.json');
      expect(hasManifest, `${res.browser} zip must include root manifest.json`).toBe(true);

      // Verify service worker bundle
      const hasServiceWorker = parsed.some((p) => p.filename === 'background/service-worker.js');
      expect(hasServiceWorker, `${res.browser} zip must include service worker`).toBe(true);

      // Verify content script bundle
      const hasContent = parsed.some((p) => p.filename === 'content/nexus-content.js');
      expect(hasContent, `${res.browser} zip must include content script`).toBe(true);

      // Verify popup and options HTML
      expect(parsed.some((p) => p.filename === 'popup/popup.html')).toBe(true);
      expect(parsed.some((p) => p.filename === 'styles/nexus.css')).toBe(true);

      // Ensure no source maps are packaged in release zips
      const hasMaps = parsed.some((p) => p.filename.endsWith('.map'));
      expect(hasMaps, 'Release zip must not contain .map sourcemap files').toBe(false);
    }

    // Verify SHA256SUMS.txt exists in dist/
    const sumsPath = join(DIST, 'SHA256SUMS.txt');
    expect(existsSync(sumsPath)).toBe(true);
    const sumsContent = readFileSync(sumsPath, 'utf8');
    expect(sumsContent).toContain('nexus-download-tools-chrome');
    expect(sumsContent).toContain('nexus-download-tools-firefox');
  });
});
