#!/usr/bin/env bash
# Autoresearch benchmark entrypoint.
# Runs the deterministic core-module workload via Node's experimental TS loader
# + a small `.js` → `.ts` resolver hook. Emits METRIC lines on stdout.
set -euo pipefail

cd "$(dirname "$0")"

# Reasonable stability — pin to the project-expected Node 22+ for strip-types.
NODE="${NODE:-node}"
if ! command -v "$NODE" >/dev/null 2>&1; then
  echo "FATAL: node not found in PATH" >&2
  exit 2
fi

# Suppress the experimental-warning noise; the harness is deterministic so
# timing is what matters, not Node's startup banners.
export NODE_NO_WARNINGS=1

exec "$NODE" \
  --no-warnings \
  --experimental-strip-types \
  --expose-gc \
  --import "./scripts/bench-loader-register.mjs" \
  ./scripts/bench.ts
