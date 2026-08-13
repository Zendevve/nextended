import esbuild from 'esbuild';
import { copyFileSync, mkdirSync, readdirSync, statSync, watch } from 'fs';
import { join, resolve, sep } from 'path';

const ROOT = resolve(process.cwd());
const SRC = join(ROOT, 'src');
const DIST = join(ROOT, 'dist', 'chrome');
const ASSETS = join(ROOT, 'assets');
const MANIFEST = join(ROOT, 'manifest.json');

const targets = [
  { entry: 'background/service-worker.js' },
  { entry: 'content/nexus-content.js' },
  { entry: 'popup/popup.js' },
  { entry: 'options/options.js' },
];

const copies = [
  ['styles/nexus.css', 'styles/nexus.css'],
  ['popup/popup.html', 'popup/popup.html'],
  ['popup/popup.css', 'popup/popup.css'],
  ['options/options.html', 'options/options.html'],
  ['options/options.css', 'options/options.css'],
];

// Source paths whose changes must re-trigger copyStatic in watch mode.
const staticSources = new Set([
  ...copies.map(([srcRel]) => join(SRC, srcRel)),
  MANIFEST,
]);

let copyTimer = null;
let staticWatchers = [];

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

function copyStatic() {
  for (const [srcRel, outRel] of copies) {
    const from = join(SRC, srcRel);
    const to = join(DIST, outRel);
    ensureDir(resolve(to, '..'));
    copyFileSync(from, to);
  }
  ensureDir(join(DIST, 'assets'));
  copyRecursive(ASSETS, join(DIST, 'assets'));
  ensureDir(resolve(join(DIST, 'manifest.json'), '..'));
  copyFileSync(MANIFEST, join(DIST, 'manifest.json'));
  console.log('[build] static assets copied');
}

const banner = '/* Nexus Mods Download Tools */\n';

function buildOpts() {
  const watchMode = process.argv.includes('--watch');
  return {
    entryPoints: targets.map((t) => join(SRC, t.entry)),
    bundle: true,
    format: 'iife',
    target: 'es2020',
    minify: !watchMode,
    sourcemap: watchMode,
    banner: { js: banner },
    outbase: SRC,
    outdir: DIST,
    logLevel: 'info',
  };
}

function isStaticPath(p) {
  return staticSources.has(p) || p === ASSETS || p.startsWith(ASSETS + sep);
}

function scheduleCopyStatic() {
  if (copyTimer) clearTimeout(copyTimer);
  copyTimer = setTimeout(() => {
    copyTimer = null;
    copyStatic();
  }, 100);
}

function watchStatic() {
  const onChange = (base) => (_event, filename) => {
    const abs = filename ? resolve(base, filename) : base;
    if (isStaticPath(abs)) scheduleCopyStatic();
  };
  // src/ holds styles/, popup/, options/ — recursive catches html/css edits.
  staticWatchers.push(watch(SRC, { recursive: true }, onChange(SRC)));
  // assets/ lives at the repo root, outside src/.
  staticWatchers.push(watch(ASSETS, { recursive: true }, onChange(ASSETS)));
  // manifest.json: watch the repo root (non-recursive) and filter.
  staticWatchers.push(
    watch(ROOT, (_event, filename) => {
      const abs = filename ? resolve(ROOT, filename) : null;
      if (abs === MANIFEST) scheduleCopyStatic();
    })
  );
  for (const watcher of staticWatchers) {
    watcher.on('error', (err) => console.error('[build] static watcher error:', err.message));
  }
}

async function runBuild(watchMode) {
  if (!watchMode) {
    await esbuild.build(buildOpts());
    copyStatic();
    console.log('[build] dist/chrome ready');
    return null;
  }
  const ctx = await esbuild.context(buildOpts());
  await ctx.watch();
  copyStatic();
  console.log('[build] watching src -> dist/chrome');
  watchStatic();
  return ctx;
}

runBuild(process.argv.includes('--watch')).catch((e) => {
  console.error(e);
  process.exit(1);
});
