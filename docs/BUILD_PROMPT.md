# nextended — Build prompt

Paste this file (or its condensed form) to a fresh agent as the task brief. It captures every load-bearing decision the original PRD-RAW made, plus the completions the truncated §5 of the source draft was missing.

---

## ROLE

You are building **nextended**, a production-quality Chromium MV3 browser extension in TypeScript that unifies three Nexus Mods userscripts. The behaviour references are documented in `docs/SPEC.md` (and the original raw draft in `docs/PRD-RAW.md`); port **behaviour, not code**. Preserve exact network semantics (endpoints, params, headers, `credentials: "include"`) — they are load-bearing. Licence: GPL-3.0-or-later.

If you discover you are working in a workspace without the three reference userscripts, **do not fetch them from the web**; the spec is the source of truth. Synthesise fixtures from the SPEC's behaviour descriptions and use the resolver/strategy tests to lock the chain down.

## STACK (non-negotiable)

- TypeScript **strict** (every flag, including `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`).
- Vite + `@crxjs/vite-plugin`.
- pnpm (`engines` pinned in `package.json`; `packageManager` field set).
- Vitest with fixtures in `fixtures/`.
- Zod for all storage schemas.
- Vanilla DOM inside one shadow-rooted host for injected UI. **No** framework in content scripts.
- Preact for options + popup pages.
- `chrome.storage.local` + `chrome.downloads` only.
- Permissions: `storage`, `downloads`; host permissions: `*://*.nexusmods.com/*` and `*://*.nexus-cdn.com/*` only.
- ESLint (flat config) enforcing the selector-quarantine rule (see ARCHITECTURE RULES below).
- No telemetry, no external CDNs, no font loads, no update pings.

## REPOSITORY LAYOUT

(Verbatim from SPEC §3.1. The path map is load-bearing; later slices depend on it. The slice owners are background, content, options/popup, docs, fixtures/tests.)

```
nextended/
  manifest.config.ts
  vite.config.ts
  package.json
  tsconfig.json
  tsconfig.node.json
  eslint.config.js
  vitest.config.ts
  src/
    background/{worker,budget,dedupe,downloads}.ts
    content/
      index.ts            (entry; registers modules with the router)
      router.ts           (history hooks + popstate + 1× debounced MutationObserver at 150 ms)
      settings-bridge.ts  (live Settings cache + onChanged subscription)
      ui/{root,toast}.ts
      modules/
        collection/{index,engine,panel,selectModal}.ts
        nowait/index.ts
        archive/index.ts
    core/
      siteAdapters.ts     (the ONLY file allowed to contain regex / URL / selector / GraphQL literals)
      resolver.ts         (strategy chain)
      errorClassifier.ts
      graphql.ts          (typed CollectionRevisionMods client)
      pacing.ts           (pure math)
      keys.ts             (dedupe key builders; storage key builders)
      storage.ts          (Zod-validated get/set, chunking, migration quarantine)
      settings.ts         (Zod schema)
      messages.ts         (Msg union + typed send/dispatch)
      log.ts              (debug logger, [Nextended] tag)
      types.ts            (PageContext, QueueItem, BulkRun, BudgetState, DedupeEntry)
    options/main.tsx + index.html
    popup/main.tsx + index.html
    assets/icon-{16,48,128}.png  (+ icon.svg as design source)
  fixtures/   (synthesised HTML/JSON for resolver, classifier, GraphQL)
  tests/      (Vitest; mirror core/)
  docs/{SPEC,BUILD_PROMPT,PARITY,PRD-RAW}.md
```

## ARCHITECTURE RULES (hard requirements — violating any of these is a failed task)

1. **ROUTER.** Exactly one navigation detector. `history.pushState`/`replaceState` hooks (patched in the isolated world), `popstate`, plus **one** `MutationObserver` debounced at 150 ms. Emits `PageContext` per SPEC §2.2. Modules register `{ matches(ctx); mount(ctx, state?); unmount() }`. On context change, `await unmount()` fully tears down UI before `mount()`. On `other` pages: **zero** injected DOM, **zero** fetches, **zero** DOM queries beyond the router's own.

2. **SELECTOR QUARANTINE.** Every CSS selector, URL pattern, regex, and GraphQL query string lives **only** in `src/core/siteAdapters.ts`. Add an ESLint rule that fails the build if a `Literal[regex]` appears in any other file (the existing flat config in `eslint.config.js` is the reference). Adding the rule is a requirement, not optional.

3. **RESOLVER.** One `resolve(input, ctx)` in `core/resolver.ts` used by **all** modules. Strategy chain, in order, stopping at first success:

   1. `nxm-passthrough` — caller already saw an `nxm://` URL; sanity-check with `NXM_URL_RE`.
   2. `component-attr` — walk the Nexus web-component JSON (`MOD-DOWNLOAD-MODAL` / `MOD-DOWNLOAD-BUTTONS` / `MOD-FILE-DOWNLOAD`) for `secureDownloadUrl` / `downloadUrl` / `vortexDownloadUrl`, recursing into nested objects.
   3. `api-files` — `GET /api/files?id={fileId}[&nmm=1]` with `credentials: "include"`.
   4. `page-regex` — caller-supplied `modPageHtml` scanned with `PAGE_REGEX_URL_PATTERNS` (the five patterns in `siteAdapters.ts`).
   5. `generate-nmm` — `POST /Core/Libs/Common/Managers/Downloads?GenerateDownloadUrl` with `game_id`, `mod_id`, `file_id`, `nmm=1` in the body.
   6. `generate-plain` — same endpoint, no `nmm`.
   7. `deep-scrape` — fetch the mod page (`&nmm=1`) and re-run `PAGE_REGEX_URL_PATTERNS`.

   Every attempt records `{ strategy, elapsedMs }`. Every failure (non-2xx response, network error, abort, or a strategy that returns `null`) is passed through the FR6 classifier. On fatal-class failures from `generate-nmm` or `generate-plain` (status 401), the chain short-circuits with `error: "login"`. The full chain is implemented and unit-tested with a fake `HttpClient` (see `tests/core/resolver.test.ts`).

4. **ERROR CLASSIFIER.** `classify({status, body, headers, networkError})` returns one of `login | cloudflare | suspended | unresolved | network`. Heuristics: `cf-ray` / `cf-mitigated` / `cf-turnstile` / "Just a moment" / HTML markers → `cloudflare`; replaced-login-link / 401 → `login`; "temporarily suspended" → `suspended`. Bulk runs stop on `login`/`cloudflare`/`suspended`; single flows show a sticky toast. Never auto-retry through a challenge. The classifier, the policy table, and the user-facing strings all live in `core/errorClassifier.ts`; the regexes it depends on live in `core/siteAdapters.ts` (import, don't re-declare).

5. **BUDGET.** `BudgetManager` in `background/budget.ts` is the only writer to `nextended.v1.budget`. `spend()` is a single async function that re-reads storage, prunes timestamps outside the window, checks `cooldownUntil`, appends, writes — all inside one promise-chain mutex. Content scripts call `budget:spend`; if denied, the response includes `waitMs`. Content renders the countdown (single-flow toast at 1 Hz; bulk inline in the log).

6. **DEDUPE.** `DedupeManager` in `background/dedupe.ts` reads/writes `nextended.v1.dedupe`. The key is `${gameDomain}:${modId}:${fileId}` (`dedupeKey()` in `core/keys.ts`). On every successful launch, `dedupe:record` is called; on every pre-launch check, `dedupe:check` is called. The TTL is the `dedupeTtlHours` setting (default 24 h; 0 disables).

7. **RUN ENGINE.** The bulk run loop lives in `content/modules/collection/engine.ts`. State machine per SPEC §2.6. Item-level transitions are persisted to `nextended.v1.items.<runId>` (chunked at 100) before the next item is read. `cursor` advances only after a terminal status. Resume = load run + items, mark any "launched" item as "done" (launch is fire-and-forget), continue from `cursor`.

8. **ACTIVATION HYGIENE.** The content script's bootstrap path is: import core, register handlers, mount the router, evaluate. On a non-matched page (`{kind:"other"}`) it must do nothing observable — no DOM, no fetches, no observers beyond the router's own debounced one. A test or a runtime assert (logged once in debug mode) is welcome but optional.

9. **MESSAGING.** All background work goes through `chrome.runtime.sendMessage` with a discriminated `Msg` union. Background handlers are pure request/response and never push to tabs. Content polls budget at 1 Hz during countdowns. The `Msg` union is the type contract — extend it by adding a variant in `core/messages.ts`, never by casting.

10. **STORAGE MIGRATION.** Every read goes through a Zod-validated boundary. On validation failure the bad value is moved to `nextended.corrupt.<ts>` and a default is returned. The user never loses data silently; the quarantine keys are recoverable by hand if needed.

## DATA MODEL + SETTINGS + MESSAGING (verbatim from SPEC §2.3–2.5; do not rephrase)

- `PageContext`, `QueueItem`, `BulkRun`, `BudgetState`, `DedupeEntry`, `Settings`, `Msg` — all defined in `src/core/{types,settings,messages}.ts`. The shapes are pinned; the implementation is in those files. Every consumer imports from there.
- Settings defaults are opinionated and tied to the decision log: `downloadMode="vortex"`, `autoStartOnFileId=true`, `autoCloseTab=false` (D11), `skipRequirements=false` (D10), `archivedButtons=true`, `budgetWindowLaunches=200`, `budgetCooldownMs=300_000`, `dedupeTtlHours=24`.
- The messaging protocol is `{ t, ... }` discriminated union; each `t` has exactly one request shape and one response shape (union of `{ok:true, ...}` and `{ok:false, ...}`). No `any` types, no type assertions in the dispatcher.

## TESTS

Fixture directory contains synthesised Nexus-shaped data:

- `collection-revision.json` — a small and a large GraphQL response
- `modpage-with-regex-url.html`, `modpage-component-attrs.html`
- `generate-download-url.json`
- `cloudflare-challenge.html`, `logged-out.html`, `suspended.html`
- `archived-legacy.html`, `archived-current.html`

Each test must assert:

- **Route parser** classifies the four page kinds (collection / archived / mod / other) and the `isExcludedPath` exclusion list.
- **Pacing math** matches the formula in SPEC §2.6 and rejects bad inputs.
- **Dedupe keys** round-trip through `parseDedupeKey`; `pruneDedupe` and `dedupeHas` honour the TTL.
- **Settings** parses the schema, applies the defaults, and rejects invalid patches.
- **Error classifier** maps the canonical login / CF / suspension responses to the right `ErrorClass`.
- **Storage** round-trips every typed value; quarantines corrupt blobs; chunked item persistence reassembles in the right order.
- **GraphQL** normalises a real-shaped revision response and throws on non-2xx / GraphQL errors.
- **Resolver** hits each of the 7 strategies in turn, returns `login` on a 401 from `generate-nmm`, returns `unresolved` when every strategy fails, and respects the abort signal.

`pnpm test` must exit 0 and the `core/` directory must be ≥ 90% covered.

## DEFINITION OF DONE

- `pnpm install` exits 0.
- `pnpm build` exits 0 (tsc strict + vite build, `dist/manifest.json` + assets produced).
- `pnpm test` exits 0 with all tests green.
- `pnpm lint` exits 0; placing a `Literal[regex]` outside `src/core/siteAdapters.ts` demonstrably fails lint.
- The set of files in `src/` matches SPEC §3.1 exactly.
- No `TODO` / `FIXME` / `not implemented` markers anywhere in `src/`.
- `docs/SPEC.md`, `docs/BUILD_PROMPT.md`, `docs/PARITY.md`, `docs/PRD-RAW.md` all present; SPEC and BUILD_PROMPT contain no `TBD` and no truncation markers.
- Live-site behaviour (T1–T10 in SPEC §2.8) is explicitly out of scope for the autonomous build loop. A logged-in Nexus session is required to verify it; document the tests as a manual checklist in `PARITY.md`.
