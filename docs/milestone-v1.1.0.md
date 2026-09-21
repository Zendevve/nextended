# v1.1.0 — "Parity & Contract"

Gap-closing milestone from the 2026-09-21 grill-with-docs session. Source: parity audit
of nextended v1.0.2 vs Nexus Download Collection, Nexus No Wait ++, and Nexusmods
Allow archive downloads (28 checks; 14 present / 7 partial / 7 absent). Execution order:
must-fix, then fix. Decisions are backed by ADR-0001…0005.

## Must-fix (contract violations & defects)

1. Default `downloadMethod` → BROWSER (ADR-0004).
2. Wire `vpnMode`: on Cloudflare/blocked result, redirect the user to the blocked URL so
   they solve the challenge naturally (ADR-0002-adjacent; the #1 pain point in NNW++
   feedback).
3. `nxm://` handoff failure detection with a user-facing fallback message (ADR-0004).
4. Safe Floor clamp on `pauseBetweenDownloadSec`; overrides above the floor carry a
   ban-risk warning (ADR-0003).
5. `pageShield` becomes opt-out via config (ADR-0002, clause 3).
6. Userscript conflict detection: on-page dismissible banner + popup badge, ack flag
   persisted.
7. Rename `.allow-archive-downloads-wrapper` to a nextended-namespaced class — removes
   a verbatim selector copied from the CC BY-NC-SA script (ADR-0001) and the collision
   with conflict detection.
8. Fix duplicate `host_permissions` key in `manifest.json` (second declaration silently
   drops entries, incl. the aria2-RPC localhost scope).
9. `overrideFileNames` actually appends the mod id (currently only uniquifies).

## Fix (parity value)

1. Implement `forceModManagerDownload` (config key exists, zero call sites).
2. Wire `FileMatcher` into the collection toolbar's downloaded-files import (replace
   naive `name.includes(uri)`).
3. Selection JSON export + import in the select-mods modal (last real NDC capability
   gap).
4. Reconcile options UI with surviving config keys.
5. Wire `requestTimeoutMs` into fetches via `AbortSignal.timeout`.

## Explicitly dropped (do not reintroduce without revisiting this doc)

- `requestMethod` gm/fetch choice — extension architecture supersedes it; content-script
  fetch already runs in page origin; Cloudflare path covered by must-fix #2.
- Error sound / `errorSoundUrl` — remote-asset fetching violates the do-no-harm spirit;
  alerts suffice. Remove the `playErrorSound` key.
- `downloadButtonColor` — cosmetic; native buttons stay per contract clause 1. Remove
  the key.
- Shift-range selection in the select-mods modal — marginal.
- NNW++-style persistent shadow-DOM attach and popup-DOM requirements bypass —
  functionally covered by composed-path click capture and widget URL fetching.
- Opera GX-specific `nxm://` work — out of scope per ADR-0004.
