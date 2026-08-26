import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync } from 'fs';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background/index.ts'),
        content: resolve(__dirname, 'src/content/index.ts'),
        popup: resolve(__dirname, 'src/popup/index.html'),
        options: resolve(__dirname, 'src/options/index.html')
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background') return 'background.js';
          if (chunkInfo.name === 'content') return 'content.js';
          return '[name].js';
        },
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith('.css')) {
            if (assetInfo.name.includes('content')) return 'content.css';
            return '[name][extname]';
          }
          return 'assets/[name][extname]';
        }
      }
    }
  },
  plugins: [
    {
      name: 'copy-manifest-and-assets',
      closeBundle() {
        if (!existsSync('dist')) mkdirSync('dist', { recursive: true });
        copyFileSync('manifest.json', 'dist/manifest.json');
        
        // Ensure popup and options directories exist at dist root
        if (!existsSync('dist/popup')) mkdirSync('dist/popup', { recursive: true });
        if (!existsSync('dist/options')) mkdirSync('dist/options', { recursive: true });

        if (existsSync('dist/src/popup/index.html')) {
          copyFileSync('dist/src/popup/index.html', 'dist/popup/index.html');
        }
        if (existsSync('dist/src/options/index.html')) {
          copyFileSync('dist/src/options/index.html', 'dist/options/index.html');
        }

        // Copy content.css if created separately
        if (existsSync('src/content/styles/content.css')) {
          copyFileSync('src/content/styles/content.css', 'dist/content.css');
        }

        // Copy icon directory if exists
        if (existsSync('icons')) {
          if (!existsSync('dist/icons')) mkdirSync('dist/icons', { recursive: true });
          const icons = ['icon-16.png', 'icon-48.png', 'icon-128.png'];
          for (const icon of icons) {
            if (existsSync(`icons/${icon}`)) {
              copyFileSync(`icons/${icon}`, `dist/icons/${icon}`);
            }
          }
        }
      }
    }
  ],
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts']
  }
});
