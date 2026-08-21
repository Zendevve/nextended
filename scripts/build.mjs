import esbuild from 'esbuild';
import { copyFileSync, mkdirSync, readdirSync, statSync, watch } from 'fs';
import { join, resolve, sep } from 'path';

const ROOT = resolve(process.cwd());
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

const staticSources = new Set([
  ...copies.map(([srcRel]) => join(SRC, srcRel)),
  MANIFEST_CHROME,
  MANIFEST_FIREFOX,
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

function copyStatic(browser = 'chrome') {
  const dist = join(ROOT, 'dist', browser);
  for (const [srcRel, outRel] of copies) {
    const from = join(SRC, srcRel);
    const to = join(dist, outRel);
    ensureDir(resolve(to, '..'));
    copyFileSync(from, to);
  }
  ensureDir(join(dist, 'assets'));
  copyRecursive(ASSETS, join(dist, 'assets'));

  const manifestSource = browser === 'firefox' ? MANIFEST_FIREFOX : MANIFEST_CHROME;
  ensureDir(resolve(join(dist, 'manifest.json'), '..'));
  copyFileSync(manifestSource, join(dist, 'manifest.json'));
  console.log(`[build] static assets copied for ${browser}`);
}

const banner = '/* Nexus Mods Download Tools */\n';

function buildOpts(browser = 'chrome', watchMode = false) {
  const dist = join(ROOT, 'dist', browser);
  return {
    entryPoints: targets.map((t) => join(SRC, t.entry)),
    bundle: true,
    format: 'iife',
    target: 'es2020',
    minify: !watchMode,
    sourcemap: watchMode,
    banner: { js: banner },
    outbase: SRC,
    outdir: dist,
    logLevel: 'info',
  };
}

function isStaticPath(p) {
  return staticSources.has(p) || p === ASSETS || p.startsWith(ASSETS + sep);
}

function scheduleCopyStatic(browser = 'chrome') {
  if (copyTimer) clearTimeout(copyTimer);
  copyTimer = setTimeout(() => {
    copyTimer = null;
    copyStatic(browser);
  }, 100);
}

function watchStatic(browser = 'chrome') {
  const onChange = (base) => (_event, filename) => {
    const abs = filename ? resolve(base, filename) : base;
    if (isStaticPath(abs)) scheduleCopyStatic(browser);
  };
  staticWatchers.push(watch(SRC, { recursive: true }, onChange(SRC)));
  staticWatchers.push(watch(ASSETS, { recursive: true }, onChange(ASSETS)));
  staticWatchers.push(
    watch(ROOT, (_event, filename) => {
      const abs = filename ? resolve(ROOT, filename) : null;
      if (abs === MANIFEST_CHROME || abs === MANIFEST_FIREFOX) scheduleCopyStatic(browser);
    })
  );
  for (const watcher of staticWatchers) {
    watcher.on('error', (err) => console.error('[build] static watcher error:', err.message));
  }
}

async function runBuild() {
  const args = process.argv.slice(2);
  const watchMode = args.includes('--watch');
  const targetBrowsers = args.includes('--firefox')
    ? ['firefox']
    : args.includes('--chrome')
      ? ['chrome']
      : ['chrome', 'firefox'];

  for (const browser of targetBrowsers) {
    if (!watchMode) {
      await esbuild.build(buildOpts(browser, false));
      copyStatic(browser);
      console.log(`[build] dist/${browser} ready`);
    } else {
      const ctx = await esbuild.context(buildOpts(browser, true));
      await ctx.watch();
      copyStatic(browser);
      console.log(`[build] watching src -> dist/${browser}`);
      watchStatic(browser);
    }
  }
}

runBuild().catch((e) => {
  console.error(e);
  process.exit(1);
});
