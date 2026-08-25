# nextended — Specification

> Behavioural specification for **nextended**, a Chromium MV3 extension that unifies three Nexus Mods userscripts (Nexus Download Collection, Nexus No Wait ++, Allow Archive Downloads) into one install.
>
> Authoritative source: this file. Implementation source: `src/`. The two must agree; the tests in `tests/` are the bridge.

---

## 0. Decision log (the opinions, stated up front)

| #   | Decision                            | The call (and why)                                                                                                                                                                                                                  |
| --- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Name                                | **nextended** (user-selected, replaces the original "Nexus Suite" draft).                                                                                                                                                          |
| D2  | Platform                            | Chromium MV3 only for MVP. Firefox MV3 event pages differ enough to double lifecycle testing; structure for it, ship it in v1.1.                                                                                                  |
| D3  | Build tooling                       | Vite + @crxjs/vite-plugin, pnpm. HMR for content scripts, sane manifest generation; Plasmo is heavier and opinionated in the wrong places for injected-DOM work.                                                                  |
| D4  | Content-script UI                   | Vanilla DOM + Shadow DOM root, no React. The panel is imperative state-machine UI; React in a content script adds 40 KB and hydration headaches for zero benefit. Shadow root isolates from Nexus's Tailwind.                       |
| D5  | Popup/options UI                    | Preact. Forms benefit from a framework; Preact keeps the bundle trivial.                                                                                                                                                            |
| D6  | State validation                    | Zod schemas on every storage read. MV3 workers die constantly; corrupted/stale state is the #1 bug class. Validate-or-migrate-or-reset at the boundary.                                                                            |
| D7  | Where the bulk loop runs            | Content script, background owns only budget + chrome.downloads. The collection tab must stay open anyway (Vortex nxm:// handoff needs a page); putting the loop in the worker means fighting 30-second lifetimes for nothing.        |
| D8  | Script C's fate                     | Deleted as a module. It is a strict subset of Script B's archive handler; keep only its `ModRequirementsPopUp?id={fileId}&game_id={gameId}` URL format as a legacy-markup fallback inside the archive module.                      |
| D9  | Rate budget                         | Global, shared, background-owned, first-class feature. The uncoordinated 200-cap is the real user-harming bug in the userscript trio; fixing it is the product's headline value.                                                |
| D10 | Requirements skip default           | Off. The userscript defaults it on; an extension shipped to strangers should default to respecting mod authors' requirement notices. Power users flip one toggle.                                                              |
| D11 | Auto-close tab default              | Off. `window.close()` is unreliable and surprising; opt-in.                                                                                                                                                                          |
| D12 | Filename override, error sound, VPN mode, revision diff, disk import, selection export, force-NMM | All deferred to v1.1. None are needed to replace the daily-driver workflows; each adds a permission, a fetch path, or a UI surface.                                                                                                |
| D13 | Telemetry                           | None, ever, including "anonymous". Trust is the currency for a modding-community tool; local debug logs only.                                                                                                                       |
| D14 | Distribution                        | GitHub releases + unpacked install first; Web Store attempt second. Store review may reject download automation; don't gate the roadmap on it.                                                                                    |
| D15 | Licence                             | GPL-3.0. Script B is GPL-3.0-or-later; behaviour-porting from it is safest under a compatible licence, and it fits the community norm.                                                                                              |
| D16 | Anti-bypass line                    | Detect and surface login walls, Cloudflare, suspensions; never automate past them; keep NDC's ad-cookie write out of the MVP. Legal/ToS posture and store review survivability. The cookie trick is the single most objectionable behaviour in the three scripts. |

---

## 1. PRD

### 1.1 Summary

A Chromium extension that replaces three userscripts — Nexus Download Collection, Nexus No Wait ++, and Allow Archive Downloads — with one install. It provides bulk collection downloading, instant single-file downloading, and archived-file access, built on exactly one implementation of each shared concern: link resolution, error classification, rate budgeting, deduplication, navigation detection, storage, and settings.

### 1.2 Problem

Users who run all three scripts today experience:

- **Duplicate injections** — Scripts B and C both add buttons to archived-file pages; ordering is luck.
- **Uncoordinated rate limiting** — Script A caps itself at 200 launches per window; Script B doesn't know that counter exists. Bulk + manual use together can trip Nexus's temporary suspension, the exact outcome both scripts individually guard against.
- **Double downloads** — A bulk run resolves a file; the user later clicks the same file's page; B auto-fires it again.
- **Triple maintenance surface** — three regex/selector sets rot independently every time Nexus ships HTML changes (both A and B carry visible layers of patched-over patterns).
- **Userscript-manager dependency** — install friction, MV3-related manager instability, no options UI conventions.

### 1.3 Goals and success metrics

| Goal                              | Metric (measured locally, debug mode)                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Feature parity for daily workflows| Parity checklist (§5.6 of the build prompt) 100% green                                                |
| One implementation per shared concern | Zero duplicated regex/selector definitions outside `siteAdapters.ts` (lint-enforced)            |
| Strict page-scoped activation     | 0 fetches, 0 injected nodes on non-matched pages                                                      |
| Cross-flow safety                 | Budget counter provably shared (acceptance test T4); dedupe hit rate visible in logs                   |
| Resilience                        | Bulk run resumes after worker kill / tab reload with no re-launched items                             |

### 1.4 Users

- **The collection installer:** downloads 50–800 files in one sitting, non-premium, uses Vortex. Cares about: not getting suspended, resuming after failure, skipping what they already have.
- **The browser:** opens individual mod pages daily. Cares about: zero countdown, zero requirement-popup friction (when they choose), archived files just working.

Both are the same person on different days — which is exactly why the budget and dedupe must be shared.

### 1.5 Functional requirements

**FR1 — Router.** One navigation detector (history API hooks + popstate + one debounced MutationObserver, 150 ms). Emits `PageContext`. Modules implement `mount(ctx)` / `unmount()`. Route change fully tears down previous module UI. No other global observers exist.

**FR2 — Collection module** (context: `collection`).

- Fetch mod list via GraphQL `CollectionRevisionMods` (credentials included, `viewAdultContent: true`).
- Panel with: download all / mandatory only / optional only / select…; mod counts per category; Vortex vs browser mode radio.
- Selection modal: search, sort (mod name / file name / size, asc/desc), shift-click range select, live count.
- Run engine: sequential, per-item pacing = `fileSizeKB / (assumedSpeedMBps × 1024) + extraPauseSeconds`; controls pause / stop / skip-pause / skip-to-index; progress bar with %, n/total, status text.
- Per-collection history keyed `game → collection → runType → fileId[]`; on start with non-empty history: modal offering Skip downloaded / Redownload all / Cancel (replaces `window.confirm`).
- Timestamped log console: per-item outcome, strategy used, failures with mod-page link, collapsible.

**FR3 — Shared resolver.** One `resolve(item): Promise<Resolution>` used by every module. Strategy chain, in order, stopping at first success:

1. `nxm://` passthrough
2. Secure `downloadUrl` / `vortexDownloadUrl` read from Nexus web-component JSON attributes (`MOD-DOWNLOAD-MODAL`, `MOD-DOWNLOAD-BUTTONS`, `MOD-FILE-DOWNLOAD`)
3. `/api/files/…` endpoint (with `nmm=1` appended when manager mode)
4. Mod-page HTML fetch (`&nmm=1`) + the full regex pattern list from the reference scripts
5. `POST /Core/Libs/Common/Managers/Downloads?GenerateDownloadUrl` with `nmm=1`
6. Same endpoint without `nmm`
7. Deep scrape: component-attribute JSON (`downloadUrl` keys) then `nexus-cdn.com` URL regex

Every resolution records `{ strategy, elapsedMs }`. Every failure passes through FR6 classification.

**FR4 — NoWait module** (context: `mod`).

- Capture-phase click interception, `composedPath()`-aware, honouring the exclusion list (pagination, comments, forum posts, search results, own UI).
- Auto-start on `file_id=` URLs with per-fileId once-only guard and a dedupe-registry check (FR7).
- Requirements handling per D10: when skip is off, yield to native UI whenever requirements are present or unknown; when on, rewrite `tab=requirements` → `tab=files` and proceed.
- Slow-download button intercept inside mod-file-download shadow root.
- Button state feedback (Please wait… / Downloading! / error text), original state restored after 4 s; colour tint behind a setting, default off.

**FR5 — Archive module** (context: `archived`). Single implementation injecting Manual + Mod-manager buttons per archived file row, plus the "File archive" footer link on the files tab. Primary: Script B's direct `file_id` URL injection. Fallback when new markup is absent: Script C's `ModRequirementsPopUp?id={fileId}&game_id={gameId}` format. Idempotent via WeakSet + `data-nextended-*` marker attributes.

**FR6 — Error classifier.** One function mapping response text/status/headers → `login | cloudflare | suspended | unresolved | network`. Heuristics ported from both scripts (replaced-login-link; cf-turnstile / "Just a moment" / cf-ray + 403/503 + HTML body; "temporarily suspended"). Policy layer: bulk runs force-stop on login/cloudflare/suspended with an actionable log line (login link, solve-challenge link); single flows show one dismissible in-page toast. Never auto-retry through a challenge.

**FR7 — Dedupe registry.** Key `${gameDomain}:${modId}:${fileId}`, persisted, TTL 24 h (setting). Written on every successful launch from any module. Consulted by bulk engine (skip + log) and auto-start (decline with visible "already downloaded — Download anyway?" toast offering a force button).

**FR8 — Shared budget.** Background-owned rolling counter of launched downloads across all modules. Window: 200 launches; on hit, 5-minute cooldown enforced globally. Content scripts query `getBudget()` before launching and render the countdown (bulk: inline in the run log, exactly as NDC did; single: toast with mm:ss). `spend()` is atomic in the background (single message handler, serialized via a promise queue — no races between tabs).

**FR9 — Download execution.** Vortex mode: `location.assign(nxm://…)` from the content script. Browser mode: `chrome.downloads.download` from the background (filename = server-provided; override feature deferred).

**FR10 — Settings.** One options page, sections General / Collections / Single downloads / Archived files / Advanced. Unified schema (§2.4), Zod-validated, defaults per decision log. Live propagation via `chrome.storage.onChanged`. Import/export settings as JSON (cheap, high-value for the community).

**FR11 — Persistence.** Every run-engine transition and every budget/dedupe/history mutation hits `chrome.storage.local` before the next action. On collection-page mount with an interrupted run present: banner offering Resume / Discard.

**FR12 — Debug mode.** Structured console logging (`[Nextended] event {data}`) plus a local counters panel in options: discovered, deduped, resolved-by-strategy histogram, failures-by-class, budget spend.

### 1.6 Non-functional requirements

- **Activation hygiene:** on other pages the content script runs URL matching only — no DOM queries, no observers beyond the router's (which is idle until a matched context), no fetches.
- **Selector quarantine:** every selector, URL pattern, regex, and GraphQL query lives in `src/core/siteAdapters.ts`. An ESLint `no-restricted-syntax` rule (selector `Literal[regex]`) fails the build if any such literal appears elsewhere.
- **Permissions:** `storage`, `downloads`; host permissions `*://*.nexusmods.com/`, `*://*.nexus-cdn.com/`. Nothing else. No tabs, no webRequest.
- **Performance:** content bootstrap < 50 ms before first paint impact; collection panel renders within 150 ms of GraphQL response for 800 items (virtualise the selection modal list above 200 rows).
- **Privacy:** no external requests except Nexus endpoints. No update pings, no fonts, no CDNs.

### 1.7 Explicit non-goals

Bypassing or automating past login, Cloudflare, premium gating, or rate limits (the ad-interstitial cookie write from NDC is removed, per D16). CAPTCHA handling. Non-Nexus sites. Cloud sync. Telemetry. Mobile.

### 1.8 Risks

| Risk                              | Severity | Mitigation                                                                                          |
| --------------------------------- | -------- | --------------------------------------------------------------------------------------------------- |
| Nexus ToS / store rejection       | High     | D14 distribution order; D16 anti-bypass line; budget system as good-citizen evidence                |
| Nexus HTML/GraphQL drift          | High, recurring | Selector quarantine + fixture-based tests + a "site adapter version" log line                |
| MV3 worker lifecycle corrupting state | Medium | D7 (loop in content), storage-first state machine, Zod validation, resume banner                   |
| Shadow-DOM component changes breaking interception | Medium | Strategy chain degrades gracefully; failures classify as `unresolved` with native UI still clickable |
| GPL obligations                   | Low      | D15; publish source from day one                                                                    |

---

## 2. MVP spec

### 2.1 Scope table

| Feature                                                | MVP | v1.1 | Never |
| ------------------------------------------------------ | --- | ---- | ----- |
| Collection bulk download (all/mandatory/optional/select) | ✅  |      |       |
| Pacing, pause/stop/skip-pause/skip-to-index, progress, log | ✅  |      |       |
| Per-collection history + skip-downloaded               | ✅  |      |       |
| Resume interrupted run                                 | ✅  |      |       |
| Countdown skip + auto-start on `file_id=`              | ✅  |      |       |
| Requirements skip (default off)                        | ✅  |      |       |
| Archived-file buttons (unified B+C)                    | ✅  |      |       |
| Shared budget + dedupe                                 | ✅  |      |       |
| Options page + settings import/export                  | ✅  |      |       |
| Vortex + browser modes                                 | ✅  |      |       |
| Revision diff ("update collection")                    |     | ✅   |       |
| Disk import / selection export-import                  |     | ✅   |       |
| Force-NMM button injection                             |     | ✅   |       |
| Filename override (`-{modId}` suffix)                  |     | ✅   |       |
| Error sound, VPN fallback mode                         |     | ✅   |       |
| Firefox build                                          |     | ✅   |       |
| Ad-cookie bypass, challenge automation, telemetry      |     |      | ❌    |

### 2.2 Page contexts

```ts
type PageContext =
  | { kind: "collection"; gameDomain: string; slug: string; revision: number | null }
  | { kind: "mod"; gameDomain: string; modId: string; fileId: string | null; tab: string | null }
  | { kind: "archived"; gameDomain: string; modId: string }
  | { kind: "other" };
```

Parsing rules (in `siteAdapters.ts`):

- `collection`: `/games/{gameDomain}/collections/{slug}(/revisions/{n})?`
- `archived`: `/{gameDomain}/mods/{id}` with `tab=files&category=archived` (takes precedence over mod)
- `mod`: `/{gameDomain}/mods/{id}` otherwise; fileId from `?file_id=`
- everything else: `other`

### 2.3 Core data model

```ts
type ErrorClass = "login" | "cloudflare" | "suspended" | "unresolved" | "network";

type Strategy =
  | "nxm-passthrough" | "component-attr" | "api-files"
  | "page-regex" | "generate-nmm" | "generate-plain" | "deep-scrape";

interface QueueItem {
  key: string;                    // `${gameDomain}:${modId}:${fileId}`
  fileId: string;
  modId: string;
  gameDomain: string;
  gameNumericId: number;          // needed by GenerateDownloadUrl
  modName: string;
  fileName: string;
  fileUri: string;                // for v1.1 disk import
  sizeKB: number;
  optional: boolean;
  modPageUrl: string;             // .../mods/{modId}?tab=files&file_id={fileId}
  status: "pending" | "resolving" | "launched" | "done" | "failed" | "skipped";
  strategy?: Strategy;
  errorClass?: ErrorClass;
  updatedAt: number;
}

interface BulkRun {
  runId: string;
  gameDomain: string;
  collectionSlug: string;
  revision: number | null;
  runType: "all" | "mandatory" | "optional" | "custom";
  mode: "vortex" | "browser";
  itemKeys: string[];
  cursor: number;                 // index of next item
  engine: "idle" | "running" | "paused" | "stopped" | "finished";
  startedAt: number;
  updatedAt: number;
}

interface BudgetState {
  launches: number[];             // timestamps within window
  cooldownUntil: number | null;
}

interface DedupeEntry { key: string; launchedAt: number; }
```

Storage layout (`chrome.storage.local`, all top-level keys versioned):

```
nextended.v1.settings          Settings
nextended.v1.budget            BudgetState
nextended.v1.dedupe            DedupeEntry[]          (pruned on write)
nextended.v1.history           { [game]: { [slug]: { [runType]: fileId[] } } }
nextended.v1.run.<runId>       BulkRun
nextended.v1.items.<runId>     QueueItem[]            (chunked at 100 items/key)
nextended.v1.activeRun         runId | null
```

Migration policy: unknown version key → attempt Zod-parse of nearest schema → on failure, quarantine to `nextended.corrupt.<ts>` and reset that key only. Never wipe history or budget silently.

### 2.4 Settings schema (with the opinionated defaults)

```ts
const Settings = z.object({
  // General
  downloadMode: z.enum(["vortex", "browser"]).default("vortex"),
  debugMode: z.boolean().default(false),
  // Collections
  assumedSpeedMBps: z.number().min(0.1).default(1.5),
  extraPauseSeconds: z.number().int().min(0).default(5),
  skipDownloadedPrompt: z.boolean().default(true),
  // Single downloads
  autoStartOnFileId: z.boolean().default(true),
  autoCloseTab: z.boolean().default(false),        // D11
  closeTabDelayMs: z.number().int().min(500).default(2000),
  skipRequirements: z.boolean().default(false),    // D10
  buttonColorFeedback: z.boolean().default(false),
  // Archived
  archivedButtons: z.boolean().default(true),
  // Advanced
  budgetWindowLaunches: z.number().int().default(200),
  budgetCooldownMs: z.number().int().default(5 * 60_000),
  dedupeTtlHours: z.number().int().min(0).default(24), // 0 disables
  requestTimeoutMs: z.number().int().default(30_000),
});
```

### 2.5 Messaging protocol (content ↔ background)

Typed request/response over `chrome.runtime.sendMessage`, discriminated union:

```ts
type Msg =
  | { t: "budget:get" }                      // → BudgetState + derived {allowed, waitMs}
  | { t: "budget:spend"; key: string }       // → { ok: true } | { ok: false; waitMs }
  | { t: "download:browser"; url: string; filename?: string }  // → { downloadId }
  | { t: "dedupe:check"; key: string }       // → { hit: boolean; launchedAt? }
  | { t: "dedupe:record"; key: string };
```

Rules: background handlers are pure request/response, serialized per message type; the background never pushes to tabs (content polls budget during countdowns at 1 Hz). This keeps the worker stateless-restartable: every handler re-reads storage.

### 2.6 Run engine state machine (content script)

```
start(runType, items)          item launched          pause elapsed / skip-pause
        ↓                          ↓                          ↓
     idle ──────────────→ running ───────────────→ pacing ──→ running
                              ↑  ↓ user pause        ↓ budget denied
                              ├── paused ←───────────┘ (cooldown state)
                              └── user resume
user stop / fatal error class → stopped
cursor == items.length        → finished
```

Item-level: `pending → resolving → (launched → done) | failed | skipped`. Invariants:

- `cursor` advances only after the item reaches a terminal status and state is persisted.
- `budget:spend` is called after successful resolution, before launch; a denial parks the engine in cooldown without consuming the item.
- Fatal error classes (login, cloudflare, suspended) transition the engine to `stopped` and write the reason to the run record so the resume banner can explain itself.
- Resume = load run + items, verify cursor item is not launched-but-unconfirmed (if so, mark done — a launch is fire-and-forget), continue.

### 2.7 Injected UI spec

All injected UI lives in one shadow-rooted host element per page (`<nextended-root>`), own stylesheet, dark theme matching Nexus's palette (`#da8e35` accent — both userscripts already converged on it).

**Collection panel** (appended below collection header, as NDC did):

- Header row: mode radios (Vortex / Browser) · budget indicator (184/200) · settings gear (opens options).
- Primary button Download all (N) + split menu: mandatory (N), optional (N), select….
- Run view (replaces buttons while running): progress bar (% · n/total · status), pause/stop, skip-pause, skip-to-index input, pacing inputs (speed, extra pause) with the two info tooltips ported from NDC.
- Log console: 10 rem, resizable, hide/show toggle, timestamped rows, error rows in red with action links.
- Resume banner when an interrupted run exists.

**Mod page:** no persistent UI. Button-state text swaps + one toast container (bottom-right, auto-dismiss 6 s, error toasts sticky). Toast variants: error (classified message + link), dedupe ("Downloaded 3 h ago — Download anyway?"), cooldown countdown.

**Archived page:** injected button rows visually identical to native `btn inline-flex` markup.

### 2.8 Acceptance tests (live-site, OUT of autonomous verification scope)

- **T1** Activation hygiene: on Nexus home, profile, forums: zero `<nextended-root>` nodes, zero extension-initiated fetches.
- **T2** Archive collision: on `category=archived`, exactly one button set per file row, idempotent across 5 forced re-renders.
- **T3** Dedupe cross-flow: bulk-download item X; open X's `file_id=` URL; auto-start declines with toast; "Download anyway" works and re-records.
- **T4** Shared budget: 10 bulk + 3 manual launches → budget shows 13; set window to 12 → 13th launch enters cooldown with countdown in both surfaces.
- **T5** Worker kill: service-worker stop mid-run → run continues (loop is content-side) and next `budget:spend` succeeds after worker cold-start.
- **T6** Tab reload mid-run: reload at item 7/20 → resume banner → resumes at 7, items 1–6 untouched.
- **T7** Fatal classes: logged out → bulk stops at first item, log shows login link; single click shows login toast. Simulated Cloudflare fixture → cloudflare class, stop + solve link.
- **T8** Requirements default: fresh install, mod with requirements → native popup appears (skip is off). Toggle on → straight to file.
- **T9** Strategy fallback: fixture with no regex match but valid `GenerateDownloadUrl` response → resolves via `generate-nmm`, histogram increments.
- **T10** Parity smoke: run the parity checklist on 2 games × (1 small collection, 1 200+ collection) in both modes.

---

## 3. Technical spec

### 3.1 Repository layout

```
nextended/
  manifest.config.ts            // CRXJS typed manifest
  vite.config.ts
  package.json                  // pnpm, engines pinned
  tsconfig.json
  tsconfig.node.json
  eslint.config.js              // selector-quarantine rule
  vitest.config.ts
  src/
    background/
      worker.ts                 // message router only
      budget.ts                 // BudgetState ops (atomic, storage-first)
      dedupe.ts
      downloads.ts              // chrome.downloads wrapper
    content/
      index.ts                  // entry: router + module registry
      router.ts                 // history hooks + debounced observer
      settings-bridge.ts        // live settings cache
      ui/
        root.ts                 // shadow host, style injection
        toast.ts
      modules/
        collection/
          index.ts              // mount/unmount
          engine.ts             // run state machine
          panel.ts
          selectModal.ts
        nowait/
          index.ts
        archive/
          index.ts
    core/
      siteAdapters.ts           // ALL selectors/regex/URLs/GraphQL (quarantine)
      resolver.ts               // strategy chain
      errorClassifier.ts
      graphql.ts                // typed CollectionRevisionMods client
      pacing.ts                 // pause math (pure)
      keys.ts                   // dedupe key builders (pure)
      storage.ts                // Zod-validated get/set, chunking, migration
      settings.ts               // Zod schema
      messages.ts               // Msg union + typed send/handle
      log.ts
      types.ts
    options/                    // Preact
      main.tsx
      index.html
    popup/                      // Preact
      main.tsx
      index.html
    assets/
      icon-16.png  icon-48.png  icon-128.png  icon.svg
  tests/                        // Vitest, mirrors core/
  docs/
    SPEC.md                     // this file
    BUILD_PROMPT.md             // agent-facing build brief
    PARITY.md                   // userscript-feature → nextended-module map
    PRD-RAW.md                  // original raw PRD
```

### 3.2 Contracts worth pinning

- **Resolver** — `resolve(input, ctx: {isNMM: boolean; signal: AbortSignal; client: HttpClient}) → { ok: true; url; strategy; elapsedMs } | { ok: false; error: ErrorClass; evidence: string }`. Pure orchestration; all fetches injected via an `HttpClient` interface so tests run against fixtures with zero network.
- **Budget** — `spend()` reads, prunes timestamps outside the window, checks `cooldownUntil`, appends, writes, returns — all inside one queued async section (a simple promise-chain mutex; MV3 workers are single-threaded but interleave awaits).
- **Router** — modules register `{ matches: (ctx) => boolean; mount; unmount }`. Router diffs consecutive contexts by deep equality; unmount is awaited before mount. The MutationObserver exists only to catch Nexus's client-side route swaps that skip history APIs (the NDC scenario) and is debounced at 150 ms.

### 3.3 GM API → extension mapping (implementation notes)

| Userscript behaviour                  | Port                                                                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `GM.getValue` config                  | `storage.ts` + Zod + `onChanged` subscription                                                                       |
| `GM_xmlhttpRequest` to nexusmods.com  | Content-script fetch with `credentials: "include"` (same-origin, carries session)                                  |
| `GM_xmlhttpRequest` to nexus-cdn      | Background fetch (host permission) — only used by deep-scrape verification                                          |
| `GM_download`                         | Deferred with filename override (v1.1); browser mode uses `chrome.downloads`                                       |
| `GM_registerMenuCommand("Settings")`  | Action popup + options page                                                                                          |
| NDC's `window.confirm/alert`          | In-panel modals/toasts (extension pages can't rely on blocking dialogs and they're hostile UX anyway)                |
| `history.pushState` monkey-patching   | Same technique in the isolated world; the MAIN-world bridge (per §3.3 of the original draft) is a v1.1 polish item   |

---

## 4. Implementation plan

Solo developer, focused. Total: ≈ 4 working weeks including hardening. Ordering is vertical-slice, highest-frequency feature first, shared core extracted from real usage rather than speculatively.

**Phase 0 — Behaviour extraction & fixtures (2 days)**

- Synthesise fixtures (the original userscripts are not available in this workspace): GraphQL responses (small + large collection), mod pages in every markup variant (regex-era, component-era), GenerateDownloadUrl responses, logged-out page, Cloudflare page, suspension page, both archived-page markups.
- Port pure logic with tests first: URL/route parsing, dedupe keys, pacing math, error classifier, resolver strategy chain against fixtures, GraphQL response normaliser.
- Exit gate: `pnpm test` green with ≥ 90% coverage on `core/`; zero browser involved yet.

**Phase 1 — Shell (3 days)**

- Manifest, CRXJS build, storage layer with Zod + chunking + migration quarantine, settings schema + options page skeleton, message bus, background worker with budget/dedupe/downloads handlers.
- Router with history hooks + popstate + MutationObserver.
- Exit gate: extension loads; visiting each page type logs the correct `PageContext`.

**Phase 2 — NoWait slice (4 days)**

- Click interception, auto-start, requirements policy, slow-button intercept, toasts, button feedback.
- Wire to resolver + classifier + budget + dedupe (their first real consumers).

**Phase 3 — Collection slice (5 days)**

- GraphQL client, panel, selection modal, run engine with full persistence, history + skip-downloaded modal, log console, resume banner.

**Phase 4 — Archive module + overlap hardening (2 days)**

- Unified archive injection with legacy fallback; idempotency markers.
- Stale-UI teardown audit (navigate collection → mod → archived → collection rapidly).

**Phase 5 — Polish & release (3 days)**

- Options page completeness + settings import/export; popup; empty/error states; icon set.
- README (install, architecture, parity map), CHANGELOG mapping every userscript feature → module/status.

**Standing rules during all phases**

- Any new selector/regex discovered mid-build goes into `siteAdapters.ts` with a fixture — no exceptions.
- Every bug found on the live site becomes a fixture + test before it's fixed.
- Keep a `PARITY.md` updated as features land; it is the release gate.
