// Resolver hook: rewrite `./foo.js` import specifiers to their sibling `./foo.ts`.
// Used by the benchmark harness so the TypeScript source under src/ (which
// uses NodeNext-style `.js` specifiers) can be imported directly via Node's
// experimental strip-types loader without a separate compile step.

import { existsSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve as pathResolve } from "node:path";

export async function resolve(specifier, context, nextResolve) {
  if (
    typeof specifier === "string" &&
    specifier.endsWith(".js") &&
    context.parentURL &&
    (specifier.startsWith("./") || specifier.startsWith("../"))
  ) {
    const parentDir = dirname(fileURLToPath(context.parentURL));
    const candidate = pathResolve(parentDir, specifier);
    const tsCandidate = candidate.replace(/\.js$/, ".ts");
    if (existsSync(tsCandidate) && statSync(tsCandidate).isFile()) {
      return nextResolve(pathToFileURL(tsCandidate).href, context);
    }
  }
  return nextResolve(specifier, context);
}
