// src/content/index.ts — entry: router + module registry.
// Per PRD §1.6 / FR1: on non-matched pages the content script runs URL
// matching only — no DOM queries beyond the router's own, no fetches.

import { Router } from "./router.js";
import { nowaitModule } from "./modules/nowait/index.js";
import { archiveModule } from "./modules/archive/index.js";
import { collectionModule } from "./modules/collection/index.js";
import { settings } from "./settings-bridge.js";

const router = new Router();

async function boot(): Promise<void> {
  await settings.load();
  settings.start();

  router.register("collection", collectionModule);
  router.register("nowait", nowaitModule);
  router.register("archive", archiveModule);
  router.start();
}

void boot();
