#!/usr/bin/env bash
# Canonical benchmark entrypoint: deterministic UX-hot-path workload.
# Primary metric: ux_workload_ms (mean per-iteration wall time, lower is better).
set -u
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "node is required" >&2
  exit 1
fi

OUT="$(npx --no-install vite-node benchmark/bench.ts 2>benchmark.err)"
STATUS=$?
if [ $STATUS -ne 0 ]; then
  cat benchmark.err >&2 || true
  echo "benchmark failed with status $STATUS" >&2
  exit $STATUS
fi
rm -f benchmark.err

echo "$OUT" | grep -E '^METRIC '
if ! echo "$OUT" | grep -qE '^METRIC ux_workload_ms='; then
  echo "primary metric ux_workload_ms missing" >&2
  exit 1
fi
