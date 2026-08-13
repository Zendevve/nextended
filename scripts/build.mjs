import esbuild from 'esbuild';
import { copyFileSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';

const ROOT = resolve(process.cwd());
const SRC = join(ROOT, 'src');
const DIST = join(ROOT, 'dist', 'chrome');

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

function ensureDir(p) {
  mkdirSync(p, { recursive: true });
}

function copyRecursive(srcPath, destPath) {
  const { statSync: st } = { statSync };
  if (st(srcPath).isDirectory()) {
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
  copyRecursive(join(ROOT, 'assets'), join(DIST, 'assets'));
  ensureDir(resolve(join(DIST, 'manifest.json'), '..'));
  copyFileSync(join(ROOT, 'manifest.json'), join(DIST, 'manifest.json'));
}

const banner = '/* Nexus Mods Download Tools */\n';

function buildOpts() {
  return {
    entryPoints: targets.map((t) => join(SRC, t.entry)),
    bundle: true,
    format: 'iife',
    target: 'es2020',
    sourcemap: process.argv.includes('--watch'),
    banner: { js: banner },
    outbase: SRC,
    outdir: DIST,
    logLevel: 'info',
  };
}

async function runBuild(watch) {
  if (!watch) {
    await esbuild.build(buildOpts());
    copyStatic();
    console.log('[build] dist/chrome ready');
    return null;
  }
  const ctx = await esbuild.context(buildOpts());
  const watcher = await ctx.watch();
  copyStatic();
  console.log('[build] watching src -> dist/chrome');
  return watcher;
}

runBuild(process.argv.includes('--watch')).catch((e) => {
  console.error(e);
  process.exit(1);
});
