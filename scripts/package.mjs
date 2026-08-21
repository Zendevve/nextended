import esbuild from 'esbuild';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { crc32 as nodeCrc32, deflateRawSync } from 'node:zlib';

const ROOT = resolve(process.cwd());
const DIST = join(ROOT, 'dist');
const SRC = join(ROOT, 'src');
const ASSETS = join(ROOT, 'assets');
const MANIFEST_CHROME = join(ROOT, 'manifest.json');
const MANIFEST_FIREFOX = join(ROOT, 'manifest.firefox.json');

const targets = [
  { entry: 'background/service-worker.js' },
  { entry: 'content/nexus-content.js' },
  { entry: 'popup/popup.js' },
];

const copies = [
  ['styles/nexus.css', 'styles/nexus.css'],
  ['popup/popup.html', 'popup/popup.html'],
  ['popup/popup.css', 'popup/popup.css'],
];

const banner = '/* Nexus Mods Download Tools */\n';

/**
 * CRC-32 calculator with fallback for compatibility across all Node 18.18+ versions.
 */
export function calculateCrc32(buf) {
  if (typeof nodeCrc32 === 'function') {
    return nodeCrc32(buf);
  }
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

/**
 * Encodes a JavaScript Date object into MS-DOS 16-bit time and date values.
 */
export function dosDateTime(date = new Date()) {
  const d = date instanceof Date && !isNaN(date.getTime()) ? date : new Date();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const dateVal = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date: dateVal };
}

/**
 * Creates a standard PKZIP buffer from a list of file entries.
 * Each entry has: { name: string, data: Buffer, date?: Date }
 */
export function createZipBuffer(entries) {
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  // Sort entries for deterministic output
  const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of sorted) {
    const cleanName = entry.name.replace(/\\/g, '/').replace(/^\/+/, '');
    const nameBytes = Buffer.from(cleanName, 'utf8');
    const data = entry.data;
    const crc = calculateCrc32(data);
    const uncompressedSize = data.length;
    const deflated = deflateRawSync(data);

    // Store uncompressed if deflate increases size or if 0 bytes
    const useDeflate = deflated.length < uncompressedSize && uncompressedSize > 0;
    const method = useDeflate ? 8 : 0;
    const compressedData = useDeflate ? deflated : data;
    const compressedSize = compressedData.length;
    const { time, date } = dosDateTime(entry.date);

    // Local file header (30 bytes + filename)
    const lh = Buffer.alloc(30 + nameBytes.length);
    lh.writeUInt32LE(0x04034b50, 0); // Local header signature
    lh.writeUInt16LE(20, 4); // Minimum version (2.0)
    lh.writeUInt16LE(0x0800, 6); // General purpose bit flag (bit 11: UTF-8)
    lh.writeUInt16LE(method, 8); // Compression method
    lh.writeUInt16LE(time, 10);
    lh.writeUInt16LE(date, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(compressedSize, 18);
    lh.writeUInt32LE(uncompressedSize, 22);
    lh.writeUInt16LE(nameBytes.length, 26);
    lh.writeUInt16LE(0, 28); // Extra field length
    nameBytes.copy(lh, 30);

    localHeaders.push(lh, compressedData);

    // Central directory header (46 bytes + filename)
    const cd = Buffer.alloc(46 + nameBytes.length);
    cd.writeUInt32LE(0x02014b50, 0); // Central directory signature
    cd.writeUInt16LE(20, 4); // Version made by
    cd.writeUInt16LE(20, 6); // Version needed
    cd.writeUInt16LE(0x0800, 8); // UTF-8 bit
    cd.writeUInt16LE(method, 10);
    cd.writeUInt16LE(time, 12);
    cd.writeUInt16LE(date, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(compressedSize, 20);
    cd.writeUInt32LE(uncompressedSize, 24);
    cd.writeUInt16LE(nameBytes.length, 28);
    cd.writeUInt16LE(0, 30); // Extra field length
    cd.writeUInt16LE(0, 32); // Comment length
    cd.writeUInt16LE(0, 34); // Disk number start
    cd.writeUInt16LE(0, 36); // Internal file attributes
    cd.writeUInt32LE(0x81a40000, 38); // External file attributes (regular file 0644)
    cd.writeUInt32LE(offset, 42); // Relative offset of local header
    nameBytes.copy(cd, 46);

    centralHeaders.push(cd);
    offset += lh.length + compressedData.length;
  }

  const centralDirOffset = offset;
  const centralDirSize = centralHeaders.reduce((sum, h) => sum + h.length, 0);

  // End of central directory record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // EOCD signature
  eocd.writeUInt16LE(0, 4); // Disk number
  eocd.writeUInt16LE(0, 6); // Central dir disk number
  eocd.writeUInt16LE(sorted.length, 8); // Entries on this disk
  eocd.writeUInt16LE(sorted.length, 10); // Total entries
  eocd.writeUInt32LE(centralDirSize, 12); // Size of central dir
  eocd.writeUInt32LE(centralDirOffset, 16); // Offset of central dir
  eocd.writeUInt16LE(0, 20); // Comment length

  return Buffer.concat([...localHeaders, ...centralHeaders, eocd]);
}

function ensureDir(p) {
  mkdirSync(p, { recursive: true });
}

function copyRecursive(srcPath, destPath) {
  if (statSync(srcPath).isDirectory()) {
    ensureDir(destPath);
    for (const entry of readdirSync(srcPath)) {
      copyRecursive(join(srcPath, entry), join(destPath, entry));
    }
  } else {
    ensureDir(resolve(destPath, '..'));
    copyFileSync(srcPath, destPath);
  }
}

function copyFileSyncSafe(srcPath, destPath) {
  ensureDir(resolve(destPath, '..'));
  const buf = readFileSync(srcPath);
  writeFileSync(destPath, buf);
}

function copyStatic(browser = 'chrome') {
  const dist = join(DIST, browser);
  for (const [srcRel, outRel] of copies) {
    const from = join(SRC, srcRel);
    const to = join(dist, outRel);
    copyFileSyncSafe(from, to);
  }
  ensureDir(join(dist, 'assets'));
  copyRecursive(ASSETS, join(dist, 'assets'));

  const manifestSource = browser === 'firefox' ? MANIFEST_FIREFOX : MANIFEST_CHROME;
  copyFileSyncSafe(manifestSource, join(dist, 'manifest.json'));
}

function cleanLingeringMaps(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      cleanLingeringMaps(fullPath);
    } else if (entry.endsWith('.map')) {
      unlinkSync(fullPath);
    }
  }
}

export async function buildTarget(browser = 'chrome') {
  const dist = join(DIST, browser);
  ensureDir(dist);
  cleanLingeringMaps(dist);

  await esbuild.build({
    entryPoints: targets.map((t) => join(SRC, t.entry)),
    bundle: true,
    format: 'iife',
    target: 'es2020',
    minify: true,
    sourcemap: false,
    banner: { js: banner },
    outbase: SRC,
    outdir: dist,
    logLevel: 'warning',
  });

  copyStatic(browser);
  cleanLingeringMaps(dist);
}

export function collectDirectoryFiles(dir, baseDir = dir) {
  const results = [];
  if (!existsSync(dir)) return results;
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const st = statSync(fullPath);
    if (st.isDirectory()) {
      results.push(...collectDirectoryFiles(fullPath, baseDir));
    } else if (st.isFile()) {
      if (entry.endsWith('.map')) continue; // Exclude sourcemaps from release zip
      const relPath = relative(baseDir, fullPath).replace(/\\/g, '/');
      const data = readFileSync(fullPath);
      results.push({
        name: relPath,
        data,
        date: st.mtime,
      });
    }
  }
  return results;
}

export function computeSha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

export async function packageExtension(options = {}) {
  const { browsers = ['chrome', 'firefox'], skipBuild = false } = options;

  const pkgRaw = readFileSync(join(ROOT, 'package.json'), 'utf8');
  const pkg = JSON.parse(pkgRaw);
  const version = pkg.version || '0.1.0';

  ensureDir(DIST);

  const outputs = [];
  const checksums = [];

  for (const browser of browsers) {
    if (!skipBuild) {
      console.log(`[package] Building clean production bundle for ${browser}...`);
      await buildTarget(browser);
    }

    const browserDist = join(DIST, browser);
    const entries = collectDirectoryFiles(browserDist);

    if (entries.length === 0) {
      throw new Error(`[package] No files found in ${browserDist} to package!`);
    }

    // Verify critical root manifest
    const hasManifest = entries.some((e) => e.name === 'manifest.json');
    if (!hasManifest) {
      throw new Error(`[package] Missing manifest.json in dist/${browser}!`);
    }

    console.log(`[package] Packaging ${entries.length} files for ${browser}...`);
    const zipBuffer = createZipBuffer(entries);

    const versionedZipName = `nexus-download-tools-${browser}-v${version}.zip`;
    const latestZipName = `nexus-download-tools-${browser}.zip`;

    const versionedZipPath = join(DIST, versionedZipName);
    const latestZipPath = join(DIST, latestZipName);

    writeFileSync(versionedZipPath, zipBuffer);
    writeFileSync(latestZipPath, zipBuffer);

    const hash = computeSha256(zipBuffer);
    const sizeKb = (zipBuffer.length / 1024).toFixed(1);

    checksums.push(`${hash}  ${versionedZipName}`);
    checksums.push(`${hash}  ${latestZipName}`);

    outputs.push({
      browser,
      version,
      filename: versionedZipName,
      path: versionedZipPath,
      sizeBytes: zipBuffer.length,
      sizeKb: `${sizeKb} KB`,
      sha256: hash,
      fileCount: entries.length,
    });

    console.log(`[package] Created ${versionedZipName} (${sizeKb} KB, SHA-256: ${hash.slice(0, 12)}...)`);
  }

  const checksumsPath = join(DIST, 'SHA256SUMS.txt');
  writeFileSync(checksumsPath, checksums.join('\n') + '\n');
  console.log(`[package] Checksums written to dist/SHA256SUMS.txt`);

  return outputs;
}

// CLI execution
if (process.argv[1] && resolve(process.argv[1]) === resolve(ROOT, 'scripts', 'package.mjs')) {
  const args = process.argv.slice(2);
  const browsers = args.includes('--firefox')
    ? ['firefox']
    : args.includes('--chrome')
      ? ['chrome']
      : ['chrome', 'firefox'];
  const skipBuild = args.includes('--no-build');

  packageExtension({ browsers, skipBuild })
    .then((results) => {
      console.log('\n[package] Extension release archives successfully generated:');
      for (const res of results) {
        console.log(`  - ${res.filename} (${res.sizeKb}) -> ${res.sha256}`);
      }
    })
    .catch((err) => {
      console.error('[package] Error packaging extension:', err);
      process.exit(1);
    });
}
