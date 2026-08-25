# nextended

> A Chromium Manifest V3 extension that unifies three Nexus Mods userscripts into one install: bulk collection downloading, instant single-file downloading, and archived-file access.

**Source:** [github.com/Zendevve/nextended](https://github.com/Zendevve/nextended)
**Licence:** [Proprietary — see `LICENSE`](./LICENSE) (personal, non-commercial use only)

---

## What it does

nextended replaces:

- **Nexus Download Collection** (NDC) — bulk-download every mod in a collection with pacing, pause/resume, per-collection history, and a run log.
- **Nexus No Wait ++** — kill the countdown on individual mod pages, auto-start on `file_id=` URLs, slow-download button intercept.
- **Allow Archive Downloads** — inject Manual + Mod-manager buttons on every archived file row.

…with one install that shares:

- A single 7-strategy link resolver (no duplicated URL patterns).
- One Zod-validated storage layer with migration quarantine.
- One background-owned rate budget (200 launches / 5-minute cooldown) shared by every tab.
- One deduplication registry.
- One error classifier (login / cloudflare / suspended / network / unresolved).
- One navigation router (no second set of observers).

## Install (unpacked, Chromium)

1. Clone the repo.
2. `pnpm install`
3. `pnpm build` → produces `dist/`.
4. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, point at the `dist/` directory.

For Firefox / Web Store distribution, see [`docs/SPEC.md` §2.1](./docs/SPEC.md) (deferred to v1.1).

## Permissions requested

| Permission                     | Why                                                              |
| ------------------------------ | ---------------------------------------------------------------- |
| `storage`                      | Settings, budget, dedupe, run history, interrupted-run resume.   |
| `downloads`                    | Browser-mode downloads (Vortex mode doesn't use this).           |
| `*://*.nexusmods.com/*`        | Content script + page-aware fetch on the user's own session.     |
| `*://*.nexus-cdn.com/*`        | Deep-scrape resolver strategy only.                              |

No telemetry, no external CDNs, no update pings, no `webRequest`, no `tabs`. The list is exactly the four entries above.

## Architecture (1-minute tour)

```
src/
  core/          pure logic, no DOM — resolver, classifier, pacing, keys,
                 storage, settings, messages, types, siteAdapters
  background/    service-worker message router; budget + dedupe managers
  content/       router + settings-bridge + 3 modules:
                   collection/ (run engine + panel + selection modal)
                   nowait/     (click intercept + auto-start)
                   archive/    (idempotent button injection)
  options/       Preact options page
  popup/         Preact popup
tests/           Vitest, 86 tests covering core/
docs/            SPEC, BUILD_PROMPT, PARITY, PRD-RAW
```

Read [`docs/SPEC.md`](./docs/SPEC.md) for the full PRD (decision log, FR1–FR12, state machines, contracts), and [`docs/PARITY.md`](./docs/PARITY.md) for the userscript-feature → nextended-module parity map.

## Development

```bash
pnpm install        # one-time
pnpm test           # Vitest, 86 tests
pnpm build          # tsc strict + vite build → dist/
pnpm lint           # selector-quarantine rule (no regex literals outside
                    # src/core/siteAdapters.ts)
```

The quarantine rule is load-bearing: any new selector, URL pattern, regex, or GraphQL query must live in `src/core/siteAdapters.ts`. Lint fails otherwise.

## Project status

- v0.1.0 — MVP complete. Builds clean, 86/86 tests pass, selector quarantine enforced, full doc package.
- Live-site T1–T10 acceptance tests (those requiring a logged-in Nexus session) are documented as a manual checklist in [`docs/PARITY.md`](./docs/PARITY.md); they were not run as part of the build.
- v1.1 backlog (revision diff, disk import, filename override, error sound, VPN mode, Firefox build) is tracked in [`docs/SPEC.md` §2.1](./docs/SPEC.md).
- Ad-cookie bypass, Cloudflare / login automation, and telemetry are explicitly out of scope (project licence + D16 in the decision log).

## Licence

[Proprietary](./LICENSE). Personal, non-commercial use only. See `LICENSE` for the full text.
