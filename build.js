import { build } from 'vite';
import { resolve } from 'path';
import fs from 'fs';

async function buildExtension() {
  const root = process.cwd();
  const distDir = resolve(root, 'dist');

  // Clean dist
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
  }
  fs.mkdirSync(distDir, { recursive: true });

  console.log('Building popup UI...');
  await build({
    configFile: false,
    base: '',
    root: resolve(root, 'src/popup'),
    build: {
      outDir: resolve(distDir, 'popup'),
      emptyOutDir: true,
      rollupOptions: {
        input: resolve(root, 'src/popup/index.html')
      }
    }
  });

  console.log('Building options UI...');
  await build({
    configFile: false,
    base: '',
    root: resolve(root, 'src/options'),
    build: {
      outDir: resolve(distDir, 'options'),
      emptyOutDir: true,
      rollupOptions: {
        input: resolve(root, 'src/options/index.html')
      }
    }
  });

  console.log('Building background script (IIFE)...');
  await build({
    configFile: false,
    build: {
      outDir: distDir,
      emptyOutDir: false,
      lib: {
        entry: resolve(root, 'src/background/index.ts'),
        name: 'NexusPowerSuiteBackground',
        formats: ['iife'],
        fileName: () => 'background.js'
      }
    }
  });

  console.log('Building content script (IIFE)...');
  await build({
    configFile: false,
    build: {
      outDir: distDir,
      emptyOutDir: false,
      lib: {
        entry: resolve(root, 'src/content/index.ts'),
        name: 'NexusPowerSuiteContent',
        formats: ['iife'],
        fileName: () => 'content.js'
      }
    }
  });

  console.log('Building page shield (MAIN world IIFE)...');
  await build({
    configFile: false,
    build: {
      outDir: distDir,
      emptyOutDir: false,
      lib: {
        entry: resolve(root, 'src/content/pageShield.ts'),
        name: 'NexusPowerSuitePageShield',
        formats: ['iife'],
        fileName: () => 'pageShield.js'
      }
    }
  });

  console.log('Copying static assets & manifest...');
  fs.copyFileSync(resolve(root, 'manifest.json'), resolve(distDir, 'manifest.json'));
  fs.copyFileSync(resolve(root, 'src/content/styles/content.css'), resolve(distDir, 'content.css'));

  const iconsDir = resolve(distDir, 'icons');
  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
  }

  const icons = ['icon-16.png', 'icon-48.png', 'icon-128.png'];
  for (const icon of icons) {
    const iconSrc = resolve(root, `icons/${icon}`);
    if (fs.existsSync(iconSrc)) {
      fs.copyFileSync(iconSrc, resolve(iconsDir, icon));
    }
  }

  console.log('Extension build completed successfully!');
}

buildExtension().catch((err) => {
  console.error('Extension build failed:', err);
  process.exit(1);
});
