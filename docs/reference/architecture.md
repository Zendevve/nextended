# Architecture

MV3 Chromium extension. Restores and improves download controls for archived Nexus Mods files. Vanilla ES modules bundled by esbuild; no runtime framework.

## Layers

| Layer | Location | Responsibility |
|---|---|---|
| Content | `src/content/` | Reads and injects into the nexusmods.com page DOM; never fetches Nexus itself |
| Background (service worker) | `src/background/` | Message dispatch, sender validation, download resolution, collection history, stats |
| Nexus API | `src/nexus/` | GraphQL client and URL allow-list; runs inside the service worker |
| Storage | `src/storage/` | Settings schema, type coercion, version stamping, stats |
| Shared | `src/shared/` | Constants (`MESSAGE_TYPES`, storage keys, hosts), message factory, logger, error codes |
| Popup | `src/popup/` | Action popup UI (`popup.html`) |
| Options | `src/options/` | Options page UI (`options.html`) |

All Nexus network access happens in the service worker. Content scripts communicate only by `chrome.runtime` messages; the popup talks to the content script directly only for panel focus.

## File map

### `src/content/`

| File | Responsibility |
|---|---|
| `selectors.js` | Centralized DOM selectors plus fallback chains (`MAIN_CONTENT_SELECTORS`, `COLLECTION_PANEL_SELECTOR`, `MODAL_OVERLAY_SELECTOR`, `queryFirst`) |
| `collection-detector.js` | Parses collection routes from `window.location.pathname` |
| `collection-ui.js` | Collection downloader panel: `CollectionManager` queue, buttons, progress bar, log console, select modal |
| `no-wait.js` | Archived-file download buttons, slow-download bypass, auto-start, requirements skip, auto-close |
| `page-observer.js` | `MutationObserver` that triggers reprocessing |
| `nexus-content.js` | Entry point: init guard, message listener (`FOCUS_COLLECTION_PANEL`), settings reactivity via `storage.onChanged` |

### `src/background/`

| File | Responsibility |
|---|---|
| `service-worker.js` | `onMessage` listener, `isTrustedSender` gate, init, client refresh, dispatch |
| `handlers.js` | All message handlers: sender validation, download resolution, history, stats, `chrome.downloads` |
| `message-router.js` | `registerHandler` / `dispatch`; maps `type` to handler, wraps result or error |

### `src/nexus/`

| File | Responsibility |
|---|---|
| `collection-client.js` | `CollectionClient`: GraphQL queries against `https://api-router.nexusmods.com/graphql` |
| `url-utils.js` | `isSafeDownloadUrl` allow-list, URL parsing, `buildGenerateDownloadUrl` |

### `src/storage/`

| File | Responsibility |
|---|---|
| `defaults.js` | `DEFAULT_SETTINGS` (13 keys), `DEFAULT_STATS`, `STORAGE_VERSION` |
| `settings.js` | `getSettings` / `setSettings` / `updateSettings` / `resetSettings`, stats read/increment, type coercion, version stamping |

### `src/shared/`

| File | Responsibility |
|---|---|
| `constants.js` | `MESSAGE_TYPES`, `STORAGE_KEY_*`, `DOWNLOAD_METHOD_*`, `LOG_LEVELS`, `NEXUS_HOSTS`, `CDN_HOSTS`, `URL_SCHEME_HTTPS`, `LOG_PREFIX` |
| `messages.js` | `MessageFactory` (`ping`, `getSettings`, `settingsChanged`) and `createMessage` |
| `logger.js` | Leveled logger under `LOG_PREFIX` |
| `errors.js` | `ERROR_CODES`, `NexusDownloadError`, `errorFromCode`, `isNexusError` |

### UI

| File | Responsibility |
|---|---|
| `src/popup/popup.js` | Popup state, site classification, rows, stats line, settings toggles |
| `src/options/options.js` | Options form load/save/reset, emits `SETTINGS_CHANGED` |
| `src/styles/nexus.css` | Content-script stylesheet (panel, buttons, progress, log) |

## Build pipeline

`node scripts/build.mjs` (`npm run build`; `npm run dev` runs `--watch`) emits to `dist/chrome/`:

- esbuild IIFE bundles — target `es2020`, minified when not watching, banner `/* Nexus Mods Download Tools */`:
  - `background/service-worker.js`
  - `content/nexus-content.js`
  - `popup/popup.js`
  - `options/options.js`
- Verbatim static copies:
  - `styles/nexus.css`
  - `popup/popup.html`, `popup/popup.css`
  - `options/options.html`, `options/options.css`
  - `manifest.json`
  - `assets/` icons

`manifest.json` declares `service_worker: "background/service-worker.js"` with `"type": "module"` and content script `content/nexus-content.js` + `styles/nexus.css` at `document_idle` in the ISOLATED world.

## Message flow

```
popup ──NXDT_FOCUS_COLLECTION_PANEL──▶ content script          (direct tab message, NOT via SW)
  (chrome.tabs.sendMessage)              scrollIntoView + nxdt-panel-focus 1600 ms → { ok }

content script ──NXDT_RESOLVE_ARCHIVED_DOWNLOAD / NXDT_RESOLVE_COLLECTION_DOWNLOAD──▶ service worker
                                                                                       │
                              fetch with credentials: 'include', AbortController timeout
                                                                                       ▼
                                                                        Nexus GenerateDownloadUrl endpoint
                                                                                       │ { url } | { error, code }
                                                                                       ▼
content script ◀──{ success: true, result } | { success: false, error, code }── service worker

content script ──NXDT_START_DOWNLOAD { url }──▶ service worker
                                                   │ isSafeDownloadUrl re-check
                                                   ▼
                                          chrome.downloads.download({ url, saveAs: false })
                                                   │ { success, downloadId }
                                                   ▼
content script ◀── response ── service worker

content script ──NXDT_FETCH_COLLECTION_MODS / NXDT_FETCH_COLLECTION_REVISIONS──▶ service worker
                                                                                    │ CollectionClient
                                                                                    ▼
                                                                   api-router.nexusmods.com/graphql
```

Every inbound SW message passes `isTrustedSender` before `dispatch`; every failed response carries `{ success: false, error, code }` (see `message-protocol.md`, `security-model.md`).

## See also

- [Getting started](../tutorial/getting-started.md)
- [Add a setting](../how-to/add-a-setting.md)
- [Add a message type](../how-to/add-a-message-type.md)
- [Debug and verify](../how-to/debug-and-verify.md)
- [Distribute](../how-to/distribute.md)
- [Message protocol](message-protocol.md)
- [Settings and storage](settings-and-storage.md)
- [Errors](errors.md)
- [Permissions](permissions.md)
- [Security model](security-model.md)
- [Why the service worker owns everything](../explanation/why-the-service-worker-owns-everything.md)
- [How the download queue works](../explanation/how-the-download-queue-works.md)
- [Cloudflare and rate limits](../explanation/cloudflare-and-rate-limits.md)
- [The popup UX flow](../explanation/the-popup-ux-flow.md)
