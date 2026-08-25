import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@core": resolve(__dirname, "src/core"),
      "@content": resolve(__dirname, "src/content"),
      "@background": resolve(__dirname, "src/background"),
      "@options": resolve(__dirname, "src/options"),
      "@popup": resolve(__dirname, "src/popup"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/core/**/*.ts"],
      reporter: ["text", "html"],
    },
  },
});
