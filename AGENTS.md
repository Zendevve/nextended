# Repository Guidelines

## Project Overview

`nextended` (v1.0.2) is a Manifest V3 browser extension: a power suite for Nexus Mods.
Features: instant single-mod downloads (timer/requirements bypass), collections bulk
downloader (GraphQL fetch, mandatory/optional/custom selection, revision diffing, local
file matcher, pause/resume/stop), rate-limit/cooldown protection, archived-file unlock
injector, popup quick toggles + full options page.

## Architecture & Data Flow

- MV3 surfaces (`manifest.json`): background service worker `background.js` (`type: module`);
  isolated-world content bundle `content.js` + `content.css` at `document_idle`; MAIN-world
  `pageShield.js` at `document_start`; `action.default_popup: popup/index.html`;
  `options_ui.page: options/index.html` with `open_in_tab: true`.
- Content entry (`src/content/index.ts`): attaches `ClickInterceptor` +
  `RequirementsBypass`, watches SPA navigation (patched `history.pushState`/`replaceState`
  + `popstate` + debounced `MutationObserver` + post-hydration `handleRoute`), mounts a
  `CollectionEngine` on collection routes, auto-starts `?file_id=`/countdown pages via
  `SingleDownloader.startDownloadFlow`, always runs `ArchiveInjector.inject()`.
- Single-download flow: `ClickInterceptor.extractFileId` / `isNMMDownload` / game-ID
  resolution → `GraphQLClient.fetchPrimaryModFileId` / `fetchGameId` fallback →
  `SingleDownloader.startDownloadFlow` (`GenerateDownloadUrl`, `DownloadPopUp` /
  `ModRequirementsPopUp` widget fallbacks, Cloudflare/VPN redirect fallback) →
  `chrome.runtime.sendMessage({type: 'TRIGGER_DOWNLOAD' | 'AUTO_CLOSE_TAB'})`.
- Background (`src/background/index.ts`): `DownloadManager.init()` at import;
  `onMessage` handles `AUTO_CLOSE_TAB` (timed `chrome.tabs.remove`, `TabManager` fallback)
  and `TRIGGER_DOWNLOAD` (`DownloadManager.triggerDownload`, `return true` for async
  `sendResponse`). `DownloadManager` also handles `onDeterminingFilename` when
  `overrideFileNames` is set.
- Collections flow (`collectionEngine.ts`): `GraphQLClient.fetchCollectionMods` → split
  mandatory/optional → render `collectionToolbar` / `progressBar` / `logConsole` /
  `selectModsModal` / `updateRevisionModal` → per-file `SingleDownloader` +
  `RateLimiter` pauses + `FileMatcher` skips + `RevisionDiffer` (added/updated/removed).
- State: persisted only via `StorageManager` (`chrome.storage.local`, `localStorage`
  fallback); transient route/engine state in content-script module globals plus DOM mount
  `#nextended-collection-container` and `window.__nextended_shield_active` guard.
- Page shield (`src/content/pageShield.ts`, MAIN world): stubs blocked analytics
  (`statistics`, `ramp`, `Nexus`, `user.statistics`, `analytics`, `mixpanel`, `_qevents`,
  `quantserve`, `pSUPERFLY`, `dataLayer`, `gtag`, `ga`), wraps `exitFullscreen`, swallows
  matching `error` / `unhandledrejection` noise so blocked scripts don't break the page.

## Key Directories

- `src/common/`: shared `types.ts`, `endpoints.ts`, `config.ts` (`DEFAULT_CONFIG`),
  `storage.ts` (`StorageManager`), `logger.ts` (`Logger`).
- `src/background/`: `index.ts` (message dispatcher), `downloadManager.ts`,
  `tabManager.ts`.
- `src/content/`: `index.ts` (router/mount point), `pageShield.ts` (MAIN-world shield).
- `src/content/interceptors/`: `clickInterceptor.ts` (download-click capture + ID
  resolution), `requirementsBypass.ts` (requirements tab/modal bypass).
- `src/content/modules/`: `graphQLClient.ts`, `singleDownloader.ts`, `rateLimiter.ts`,
  `archiveInjector.ts`.
- `src/content/modules/collections/`: `collectionEngine.ts`; `utils/fileMatcher.ts`,
  `utils/revisionDiffer.ts`; `components/{collectionToolbar,progressBar,logConsole,
  selectModsModal,updateRevisionModal}.ts`.
- `src/content/styles/content.css`: shipped as `dist/content.css`.
- `src/popup/{index.html,popup.ts,popup.css}`: quick toggles + status indicator.
- `src/options/{index.html,options.ts,options.css}`: full settings, debounced auto-save.
- `tests/unit/`: 8 `*.test.ts` suites (see Testing & QA).
- `icons/`: `icon-{16,48,128}.png`; `dist/` is the unpacked-extension build output.

## Development Commands

```bash
npm install        # install deps (npm + package-lock.json)
npm run build      # node build.js → dist/
npm test           # vitest run (single pass)
npm run test:watch # vitest (watch mode)
```

Manual load: build, then `chrome://extensions/` → Developer mode → Load unpacked → select
`dist/` (Firefox: `about:debugging#/runtime/this-firefox`). No lint/format script.

## Code Conventions & Common Patterns

- TypeScript `strict`, `ES2022` / `ESNext` + `Bundler` resolution (`tsconfig.json`);
  `chrome` + `vitest/globals` types.
- Static-only service classes: `StorageManager`, `DownloadManager`, `TabManager`,
  `GraphQLClient`, `SingleDownloader`, `RateLimiter`, `ClickInterceptor`,
  `RequirementsBypass`, `ArchiveInjector`, `FileMatcher`, `RevisionDiffer`.
  Example: `await StorageManager.getConfig()`, `RateLimiter.calculateFilePause(kb, mb, extra)`.
- Const-object namespaces: `Logger`, `ENDPOINTS`, `DEFAULT_CONFIG`. Logging always via
  `Logger.{debug,info,warn,error}` (prefixes `[nextended]`); never `console.*` directly.
- Naming: `PascalCase` classes/components, `camelCase` methods/fields, `UPPER_SNAKE` consts
  (`ENDPOINTS`, `DEFAULT_CONFIG`), `*.test.ts` tests mirroring module names
  (e.g. `rateLimiter.test.ts`).
- Async: `async/await` throughout; wrap callback Chrome APIs in `new Promise`
  (`DownloadManager.triggerDownload`); `return true` from `onMessage` listeners with async
  `sendResponse`; always check `chrome.runtime.lastError` after `tabs.remove` / `downloads.download`.
- Environment guards: `typeof chrome !== 'undefined'` with fallbacks (`localStorage`,
  anchor-click download, `window.close`). `JSON.parse` fallbacks use silent `catch {}`.
- DOM idempotence: `attach()`/`inject()` guarded by `attached` flags or `WeakSet`
  (`ClickInterceptor.processing`, `ArchiveInjector.handled`); route dedupe via
  `lastRoute` / `lastAutoStartedKey`.
- SPA handling: patch `history.pushState`/`replaceState`, listen `popstate`, debounce
  `MutationObserver` (`scheduleRouteCheck(300)`), defer past hydration
  (`requestIdleCallback` else `setTimeout 300`); probe mount targets with fallbacks
  ("Add collection" card → Media heading/tabs → `main`/`#mainContent`/`#__next`).
- Config access: `StorageManager.getConfig()` merges `DEFAULT_CONFIG` under stored values;
  `setConfig(partial)` is read-merge-write. Keys: `nextended_config`,
  `nextended_history`, `nextended_rate_limit`.
- Error handling: broad `try/catch` → `Logger.error`/`warn` + safe fallback (bare `suggest()`,
  `null`, redirect to files tab); suppress only matched page-shield noise.

## Important Files

- Entry points: `src/background/index.ts`, `src/content/index.ts`,
  `src/content/pageShield.ts`, `src/popup/{index.html,popup.ts}`, `src/options/{index.html,options.ts}`.
- Config/build: `manifest.json`, `package.json`, `build.js` (5 IIFE bundles + asset copy),
  `vite.config.ts` (entries + Vitest `happy-dom` block), `tsconfig.json`.
- Core logic: `src/content/modules/singleDownloader.ts` (`startDownloadFlow`),
  `src/content/interceptors/clickInterceptor.ts` (`attach`, `extractFileId`, `isNMMDownload`),
  `src/content/modules/graphQLClient.ts` (`fetchCollectionMods`, `fetchGameId`,
  `fetchPrimaryModFileId`), `src/content/modules/collections/collectionEngine.ts`.
- Shared: `src/common/{types,config,storage,endpoints,logger}.ts`.
- Docs/legal: `README.md`, `CHANGELOG.md`, `LICENSE` (proprietary; personal non-commercial use).

## Runtime/Tooling Preferences

- Runtime: Node.js + npm (`"type": "module"`, `package-lock.json` committed). No Bun/pnpm config.
- Bundler: Vite 6 library-mode IIFE builds for `background.js`, `content.js`, `pageShield.js`
  (global names `NexusPowerSuite{Background,Content,PageShield}`); separate multi-page builds
  for `popup/` and `options/`. `vite.config.ts` also works as a Vitest config; do not treat
  its `rollupOptions.input` as the full build — `build.js` is authoritative.
- Extension targets: Chromium (`chrome://extensions`, Load unpacked `dist/`) and Firefox
  (`about:debugging`). Host scope is Nexus Mods + `api-router.nexusmods.com` + `nexus-cdn`.
- Test env: `happy-dom` via Vitest; `@types/chrome` + `@types/node` for extension/Node APIs.

## Testing & QA

- Framework: Vitest 3 (`globals: true`, `environment: 'happy-dom'`,
  `include: ['tests/**/*.test.ts']` in `vite.config.ts`).
- Suites (`tests/unit/`): `archiveInjector`, `clickInterceptor`, `fileMatcher`,
  `graphQLClient`, `pageShield`, `rateLimiter`, `revisionDiffer`, `singleDownloader`
  (~82 passing per `CHANGELOG.md` 1.0.2).
- Pattern: import unit under test, seed `StorageManager` state in `beforeEach`, assert pure
  helpers directly. Example (`rateLimiter.test.ts`): seed `{count: 199, ...}`, expect
  `registerDownload()` → `{requiresCooldown: true, waitTimeSec: 300}`.
- No coverage thresholds or e2e harness configured; verify extension changes with
  `npm test`, `npm run build`, and manual Load-unpacked smoke test on Nexus Mods pages.
