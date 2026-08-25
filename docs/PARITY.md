# nextended — Userscript parity checklist

Mapping every feature of the three unified userscripts to the nextended module that implements (or omits) it. The Status column reflects the MVP scope per SPEC §2.1.

| Source feature                                                          | Userscript(s)           | nextended module                                     | Status       |
| ----------------------------------------------------------------------- | ----------------------- | ---------------------------------------------------- | ------------ |
| **Collections (Nexus Download Collection)**                             |                         |                                                      |              |
| Download all mods in a collection                                       | NDC                     | `content/modules/collection`                         | ✅ MVP       |
| Mandatory only / Optional only                                          | NDC                     | same (runType filter)                                | ✅ MVP       |
| Custom selection (subset)                                               | NDC                     | `selectModal.ts`                                     | ✅ MVP       |
| GraphQL mod list fetch                                                   | NDC                     | `core/graphql.ts`                                    | ✅ MVP       |
| Pacing: per-file delay = size/speed + extra pause                        | NDC                     | `core/pacing.ts`                                     | ✅ MVP       |
| Pause / Resume / Stop                                                   | NDC                     | `engine.ts` + `panel.ts`                             | ✅ MVP       |
| Skip pause (per-item)                                                    | NDC                     | `engine.skipPauseForNext`                            | ✅ MVP       |
| Skip-to-index                                                           | NDC                     | `engine.setCursor` + panel input                     | ✅ MVP       |
| Progress bar with % · n/total                                            | NDC                     | `panel.ts` buildRunView                              | ✅ MVP       |
| Timestamped log console                                                  | NDC                     | `panel.ts` buildLog                                  | ✅ MVP       |
| Per-collection history (skip-downloaded)                                | NDC                     | `engine.recordHistory` + storage `nextended.v1.history` | ✅ MVP       |
| Skip-downloaded prompt (replaces `window.confirm`)                      | NDC                     | `collection/index.ts` start() handler               | ✅ MVP       |
| Resume banner on interrupted run                                        | NDC                     | `engine.resumeIfAny` on collection mount             | ✅ MVP       |
| Vortex (nxm://) mode                                                     | NDC                     | `engine.processItem` (Vortex branch)                 | ✅ MVP       |
| Browser (chrome.downloads) mode                                         | NDC                     | `engine.processItem` (browser branch) + `background/downloads.ts` | ✅ MVP |
| Pacing inputs (speed, extra pause) editable from panel                  | NDC                     | settings; `panel.ts` reads via `settings.snapshot()` | ✅ MVP       |
| **Single downloads (Nexus No Wait ++)**                                 |                         |                                                      |              |
| Countdown skip on `ModRequirementsPopUp` page                           | NNW++                   | NoWait module (capture-phase click intercept)       | ✅ MVP       |
| Auto-start on `file_id=` URL                                            | NNW++                   | `nowait.tryAutoStart`                                | ✅ MVP       |
| `nxm://` direct link                                                    | NNW++                   | `nowait.launchWithNxm`                               | ✅ MVP       |
| Slow-download button intercept                                          | NNW++                   | `nowait.onClickCapture` + `SLOW_DOWNLOAD_BTN_RE`     | ✅ MVP       |
| Button state text swap ("Please wait…" / "Downloading!")                 | NNW++                   | `nowait.onClickCapture` (original restored after 4 s) | ✅ MVP       |
| Requirements-skip (default off)                                         | NNW++                   | settings `skipRequirements`; honoured by the strategy | ✅ MVP       |
| Dedupe guard before auto-start                                          | NNW++                   | `dedupe:check` before launch; "Download anyway" toast | ✅ MVP       |
| Auto-close tab after launch                                             | NNW++                   | settings `autoCloseTab` + `closeTabDelayMs`          | ✅ MVP (off) |
| Exclusion list (pagination, comments, forum, search)                    | NNW++                   | `isExcludedPath` in `core/siteAdapters.ts`           | ✅ MVP       |
| **Archived files (Allow Archive Downloads)**                            |                         |                                                      |              |
| Manual + Mod-manager buttons per archived file                          | AAD (Script B)          | `modules/archive/injectAll`                          | ✅ MVP       |
| Legacy `ModRequirementsPopUp?id=…&game_id=…` markup fallback            | Script C (removed)      | `archive/injectAll` fallback branch                  | ✅ MVP       |
| "File archive" footer link injection                                    | AAD                     | same fallback branch                                 | ✅ MVP       |
| Idempotent injection across dynamic DOM mutations                       | AAD                     | `MutationObserver` + `injected: WeakSet` + `MARKER` attr | ✅ MVP       |
| **Cross-cutting (all three)**                                           |                         |                                                      |              |
| Rate budget (200 launches / 5-minute cooldown)                          | NDC only                | `background/budget.ts` shared by all modules         | ✅ MVP       |
| Dedupe registry (gameDomain:modId:fileId, 24 h TTL)                      | implicit                | `background/dedupe.ts`                               | ✅ MVP       |
| Settings UI (sections per module)                                       | all three (varied)      | `options/main.tsx`                                   | ✅ MVP       |
| Settings import / export (JSON)                                         | some                    | `options/main.tsx` export/import handlers            | ✅ MVP       |
| Live settings propagation                                               | implicit                | `content/settings-bridge.ts` (chrome.storage.onChanged) | ✅ MVP     |
| Debug mode + structured logging                                         | NDC                     | `core/log.ts` + popup counters                       | ✅ MVP       |
| Activation hygiene on non-matched pages                                 | implicit                | router mounts only matching modules                  | ✅ MVP       |
| **Explicit removals (per D16)**                                         |                         |                                                      |              |
| Ad-cookie bypass (NDC's interstitial trick)                             | NDC                     | —                                                    | ❌ Never     |
| Login / Cloudflare / premium auto-bypass                                | all three (varied)      | classifier detects; UI surfaces action links; no automation | ❌ Never |
| Telemetry, even anonymous                                               | some                    | —                                                    | ❌ Never     |
| **Deferred to v1.1 (D12)**                                              |                         |                                                      |            |
| Revision diff ("update collection")                                     | NDC                     | —                                                    | 🕓 v1.1      |
| Disk import / selection export-import                                   | NDC                     | —                                                    | 🕓 v1.1      |
| Force-NMM button injection                                              | NDC                     | —                                                    | 🕓 v1.1      |
| Filename override (`-{modId}` suffix)                                   | NNW++                   | —                                                    | 🕓 v1.1      |
| Error sound                                                            | NNW++                   | —                                                    | 🕓 v1.1      |
| VPN fallback mode                                                       | NNW++                   | —                                                    | 🕓 v1.1      |
| Firefox build                                                           | all three               | —                                                    | 🕓 v1.1      |

## Legend

- ✅ **MVP** — implemented and unit-tested in this build.
- 🕓 **v1.1** — explicitly deferred per D12; tracked in `docs/PRD-RAW.md`.
- ❌ **Never** — explicitly removed per D16; the extension will never add these.

## Manual verification checklist (T1–T10)

These tests require a logged-in Nexus session and the live site. They are **out of scope** for the autonomous build loop; run them by hand against an unpacked install:

1. **T1** Activation hygiene — visit `/`, `/Users/yourname`, `/forum/…`; confirm zero `<nextended-root>` in the DOM and zero extension fetches in DevTools.
2. **T2** Archive collision — visit a mod's `?tab=files&category=archived`; force-refresh 5 times; each row shows exactly one set of buttons.
3. **T3** Dedupe cross-flow — bulk-download mod X, then open X's `file_id=` URL; auto-start should decline with the "Download anyway" toast.
4. **T4** Shared budget — run a 10-item bulk + click 3 single files; popup shows 13/200. Set `budgetWindowLaunches=12` in options; 13th launch enters cooldown in both surfaces.
5. **T5** Worker kill — start a bulk run, open `chrome://serviceworker-internals`, stop the worker; the run continues; the next `budget:spend` succeeds.
6. **T6** Tab reload mid-run — start a 20-item run, reload at item 7/20; resume banner; resumes at 7.
7. **T7** Fatal classes — log out of Nexus; bulk run stops at the first item with a "Sign in" link; single click shows the same link. Block the request through a Cloudflare simulation (e.g. dev tools network throttling + a 503) and verify the cloudflare class.
8. **T8** Requirements default — fresh install; open a mod with requirements; the native requirements popup should appear (skip is off). Toggle `skipRequirements=true`; same mod goes straight to files.
9. **T9** Strategy fallback — with a stubbed `api-files` failure but a working `GenerateDownloadUrl`, the resolver histogram should increment `generate-nmm`.
10. **T10** Parity smoke — run the checklist on 2 games × (1 small collection, 1 200+ collection) in both Vortex and browser modes.
