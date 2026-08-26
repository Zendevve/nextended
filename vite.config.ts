import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import { resolve } from "node:path";
import manifest from "./manifest.config.js";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "preact",
  },
  resolve: {
    alias: {
      "@core": resolve(__dirname, "src/core"),
      "@content": resolve(__dirname, "src/content"),
      "@background": resolve(__dirname, "src/background"),
      "@options": resolve(__dirname, "src/options"),
      "@popup": resolve(__dirname, "src/popup"),
    },
  },
  build: {
    target: "es2022",
    modulePreload: false,
    sourcemap: true,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: resolve(__dirname, "src/background/worker.ts"),
        content: resolve(__dirname, "src/content/index.ts"),
        options: resolve(__dirname, "src/options/index.html"),
        popup: resolve(__dirname, "src/popup/index.html"),
      },
    },
  },
  plugins: [crx({ manifest })],
});
