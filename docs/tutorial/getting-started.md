# Getting Started

This lesson takes you from a fresh checkout to a working, instrumented copy of the **Nexus Mods Download Tools** MV3 extension: you will build it, load it into a Chromium browser, trace one collection download through the message pipeline in DevTools, and make a safe first edit. By the end you can build, load, trace, and modify the extension without breaking it.

Time: about 20 minutes.

## Prerequisites

- **Node.js 18.18+ with npm.** eslint 9 (a devDependency) requires Node `^18.18.0`, so use at least 18.18.
- **git** — the repository is on GitHub.
- **Chromium or Microsoft Edge** — any Chromium-based browser that supports Manifest V3 (Chrome 88+, Edge 88+).

Verify your toolchain:

```bash
node --version   # 18.18.0 or newer
npm --version
git --version
```

## Build the extension

Clone and build:

```bash
git clone https://github.com/Zendevve/nexus-mods-downloader.git
cd nexus-mods-downloader
npm install
npm run build
```

`npm run build` runs `node scripts/build.mjs` and writes everything the browser needs into `dist/chrome/`:

| Path in `dist/chrome/` | What it is |
|---|---|
| `background/service-worker.js` | esbuild IIFE bundle (target es2020) of `src/background/`; the MV3 service worker, declared `"type": "module"` in the manifest |
| `content/nexus-content.js` | bundle of `src/content/`; injected into `https://www.nexusmods.com/*` at `document_idle` in an isolated world |
| `popup/popup.js` | bundle of `src/popup/`; the action popup |
| `options/options.js` | bundle of `src/options/`; the options page |
| `styles/nexus.css` | content-script stylesheet, copied verbatim from `src/styles/` |
| `popup/popup.html`, `popup/popup.css`, `options/options.html`, `options/options.css` | statics copied verbatim |
| `manifest.json` | copied from the repo root |
| `assets/icon-16.png`, `icon-32.png`, `icon-48.png`, `icon-128.png` | toolbar and store icons |

Bundles are minified in a plain build; watch mode (`npm run dev`) keeps them readable. Every reference in the manifest — service worker, content script, popup, options page — resolves inside `dist/chrome/`.

## Load the unpacked extension

1. Open `chrome://extensions` (`edge://extensions` in Edge).
2. Toggle **Developer mode** (top-right).
3. Click **Load unpacked** and select the `dist/chrome` directory.
4. A card titled "Nexus Mods Download Tools" appears. Pin it via the puzzle icon so the popup is reachable; the suggested keyboard shortcut is `Ctrl+Shift+Y` (`Cmd+Shift+Y` on macOS).

The dev loop uses the watch build:

```bash
npm run dev
```

This is `node scripts/build.mjs --watch`: it rebuilds bundles and re-copies statics whenever a source file changes, leaving the build current on disk. The browser, however, loaded a snapshot, so after a rebuild you must:

1. Click the reload (circular arrow) on the extension card to pick up service-worker, popup, and options changes;
2. Refresh any open Nexus Mods page so the content script re-injects;
3. Re-open the popup.

An MV3 service worker terminates when idle, and rebuilt files on disk are never picked up automatically — the reload step is mandatory, not cosmetic.

## First run

Open a Nexus collection page:

```
https://www.nexusmods.com/{game}/collections/{slug}
```

The optional `/revisions/{n}` suffix is supported. The content script detects the route (`src/content/collection-detector.js` parses `/games/{gameDomain}/collections/{collectionSlug}`) and mounts the **collection downloader panel** (`src/content/collection-ui.js`) into the page's main content area. The panel, `.nxdt-collection-panel` with `data-nxdt-collection`, contains:

- **Segmented download method** — radio group `input[name="nxdtMethod"]`: "Send to Vortex / MO2" (`DOWNLOAD_METHOD_VORTEX`) or "Browser Direct Download" (`DOWNLOAD_METHOD_BROWSER`). Selection applies to the run; radios disable while a run is active.
- **Hero button** `#nxdtDownloadAll` — full-width "Download All Mods" with a badge showing the mod count.
- **Secondary row** `.nxdt-secondary-row` — `#nxdtDownloadMandatory` "Mandatory (N)", `#nxdtSelectMods` "Select Mods" (opens the selection modal), `#nxdtUpdateCollection` "Update Diff" (opens the update modal).
- **Progress bar** — `#nxdtProgressFill`, `#nxdtPercent`, `#nxdtCount`, `#nxdtStatusText`, with `#nxdtPlayPause` (pause/resume), `#nxdtStop` (abort), `#nxdtSkipPause` (skip the wait between mods).
- **Activity log** — toggle `#nxdtToggleLogs` / `#nxdtLogState` ("Show"/"Hide") over output `#nxdtLogOutput`. Every download, skip, and error is logged here as the queue runs.

If the panel does not appear: confirm the URL matches the collection pattern, check the popup's status dot is green (extension enabled, service worker alive), and refresh the page after any rebuild.

## Trace one download end-to-end

### 1. Popup focuses the panel

Click the toolbar icon, then click the **Collection Downloader** row. The popup sends `NXDT_FOCUS_COLLECTION_PANEL` — directly to the content script via `chrome.tabs.sendMessage`, not through the service worker. The content script scrolls the panel into view (`scrollIntoView`, smooth, `block: center`), adds the `nxdt-panel-focus` class for 1600 ms, replies `{ ok: true }`, and the popup closes. On a non-collection tab the popup opens a Nexus collection page instead.

### 2. Panel resolves the download

Click **Download All Mods**. The content script walks the mod list through a serial queue and, for each mod, sends `NXDT_RESOLVE_COLLECTION_DOWNLOAD` with `{ fileId, gameId, gameDomain }`. The service worker (registered handler in `src/background/handlers.js`) POSTs to:

```
https://www.nexusmods.com/Core/Libs/Common/Managers/Downloads?GenerateDownloadUrl
```

with body `fid=…&game_id=…` (plus `&nmm=1` for the Vortex method), headers `Content-Type: application/x-www-form-urlencoded; charset=UTF-8`, `X-Requested-With: XMLHttpRequest`, `Origin: https://www.nexusmods.com`, credentials included. `extractValidatedUrl` classifies the response — JSON keys `url`/`URL`/`Url`/`data.URI`/`data.url`, or a text-regex capture of `nxm://`/`https://` — and maps failures to an `ERROR_CODES` value (`CLOUDFLARE`, `AUTH_ERROR`, `FILE_NOT_FOUND`, `NETWORK_ERROR`, `INVALID_RESPONSE`, `TIMEOUT`, …).

### 3. Service worker starts the download

The content script sends `NXDT_START_DOWNLOAD` with `{ url }`. The service worker re-validates the URL with `isSafeDownloadUrl` (scheme `https:`, host on `nexusmods.com`/`nexus-cdn.com`; `nxm://` only when built from a real mod id), then calls:

```js
chrome.downloads.download({ url, saveAs: false })
```

and replies `{ success, downloadId }`. Every message uses the envelope `{ type, payload }`; every response is `{ success: true, result }` or `{ success: false, error, code }`. Already-downloaded mods are skipped against per-collection history with a log line like `[x/y] Skipped (already downloaded): NAME`; failed mods land in the log and the queue continues.

### 4. Watch it in DevTools

1. Open `chrome://extensions`, find the card, and click the **service worker** link. A DevTools window opens attached to the service worker.
2. Enable debug logging: open the options page (popup → **Settings**, or right-click the icon → **Options**) and turn on **Enable debug logging** (`input[name="debugLogging"]`), then save. The service worker re-applies the logger level and request timeout live via `NXDT_SETTINGS_CHANGED` — no reload required.
3. Run a download. The service worker console prints `[NXDT]`-prefixed lines (`LOG_PREFIX` in `src/shared/constants.js`), e.g. `chrome.downloads started { dlId, host, fileId }`, in the format `<ISO timestamp> [NXDT] <namespace> <LEVEL> <message> <JSON context>`. Debug-level lines appear only while `debugLogging` is on; the default level is INFO.
4. For content-script logging, right-click the Nexus page and inspect it, filtering the console by `[NXDT]`.

Turn `debugLogging` off when you are done — it is noisy.

## Make your first change

Edit a visible label, for example in `src/popup/popup.html`, change the `Countdown Skip` row label:

```html
<span class="row-label">Skip Countdowns</span>
```

Then:

```bash
npm run test     # vitest run: 12 files, 109 tests
npm run dev      # or npm run build
```

Two things to know before you touch anything:

- **The html-assets guard.** `tests/html-assets.test.js` scans every `src/**/*.html`, resolves each `src`/`href` against the page's own directory, and fails if the target does not exist. It exists because a doubled path (`popup/popup.js` referenced from inside `popup/popup.html`) once shipped a dead popup. Keep every script/style reference relative to its page's directory, and run `npm run test` after touching any HTML file.
- **Verify against the built extension, not a fixture.** Never verify a page by inlining its bundle into a test fixture — happy-dom fetches no scripts, and a green unit suite does not prove the page loads. Smoke-test `dist/chrome` in the browser and check the console for `requestfailed` or HTTP >= 400 resources.

With `npm run dev` running, the edited `popup.html` is re-copied into `dist/chrome/` automatically. Reload the extension card, open the popup, and confirm the new label. For a change to content-script code, refresh the Nexus page too. Before finishing, run the full gate:

```bash
npm run check    # lint && test && build
```

You have now built the extension, loaded it, traced a download through the message protocol into `chrome.downloads`, and made a verified edit — the full modify cycle without breaking the build.

## See also

- [Tutorial: Getting started](getting-started.md)
- [How-to: Add a setting](../how-to/add-a-setting.md)
- [How-to: Add a message type](../how-to/add-a-message-type.md)
- [How-to: Debug and verify](../how-to/debug-and-verify.md)
- [How-to: Distribute](../how-to/distribute.md)
- [Reference: Architecture](../reference/architecture.md)
- [Reference: Message protocol](../reference/message-protocol.md)
- [Reference: Settings and storage](../reference/settings-and-storage.md)
- [Reference: Errors](../reference/errors.md)
- [Reference: Permissions](../reference/permissions.md)
- [Reference: Security model](../reference/security-model.md)
- [Explanation: Why the service worker owns everything](../explanation/why-the-service-worker-owns-everything.md)
- [Explanation: How the download queue works](../explanation/how-the-download-queue-works.md)
- [Explanation: Cloudflare and rate limits](../explanation/cloudflare-and-rate-limits.md)
- [Explanation: The popup UX flow](../explanation/the-popup-ux-flow.md)
