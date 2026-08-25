import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "./package.json" with { type: "json" };

export default defineManifest({
  manifest_version: 3,
  name: pkg.name,
  version: pkg.version,
  description: pkg.description,
  permissions: ["storage", "downloads"],
  host_permissions: [
    "https://*.nexusmods.com/*",
    "https://*.nexus-cdn.com/*",
  ],
  background: {
    service_worker: "src/background/worker.ts",
    type: "module",
  },
  content_scripts: [
    {
      matches: ["https://*.nexusmods.com/*"],
      js: ["src/content/index.ts"],
      run_at: "document_start",
      all_frames: false,
      world: "ISOLATED",
    },
  ],
  action: {
    default_popup: "src/popup/index.html",
    default_title: pkg.name,
  },
  options_ui: {
    page: "src/options/index.html",
    open_in_tab: true,
  },
  icons: {
    "16": "src/assets/icon-16.png",
    "48": "src/assets/icon-48.png",
    "128": "src/assets/icon-128.png",
  },
});
