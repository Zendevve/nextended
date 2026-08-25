// Registers the .js → .ts resolver hook before user code runs. Loaded via
// `node --import ./scripts/bench-loader-register.mjs`. Idempotent: the
// underlying module loader is only initialized once.

import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./bench-loader.mjs", pathToFileURL("./scripts/"));
