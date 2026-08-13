# Architecture

## Layers

| Layer          | Location                     | Responsibility                                                                        |
| -------------- | ---------------------------- | ------------------------------------------------------------------------------------- |
| Content script | `src/content/`               | Page detection, DOM inspection, button injection, `MutationObserver`, click handling. |
| Background     | `src/background/`            | Message routing, sender validation, download orchestration, privileged HTTP, stats.   |
| Nexus          | `src/nexus/`                 | Nexus HTTP client (GraphQL), download URL validation helpers.                         |
| Storage        | `src/storage/`               | `chrome.storage` settings + statistics (typed, versioned).                            |
| Shared         | `src/shared/`                | Constants, message factory, structured logger, typed errors.                          |
| UI             | `src/popup/`, `src/options/` | Extension popup and settings pages.                                                   |

**Content scripts manipulate Nexus pages; they never perform privileged network
operations.** The service worker owns every privileged request, validates every
message sender, and validates every URL it hands to `chrome.downloads`.

## Message protocol

Content script → service worker (request/response):

```json
{
  "type": "NXDT_RESOLVE_ARCHIVED_DOWNLOAD",
  "payload": { "fileId": "123456", "slug": "skyrimspecialedition", "modId": "789", "isNMM": false }
}
```

Responses use the `dispatch` envelope:

```json
{ "success": true,  "result": { "url": "https://files.nexus-cdn.com/...", "fileId": "123456" } }
{ "success": false, "error": "Download URL is not from an allowed host", "code": "INVALID_URL" }
```

Valid message types live in `src/shared/constants.js` (`MESSAGE_TYPES`):

| Type                          | Direction            | Purpose                                            |
| ----------------------------- | -------------------- | -------------------------------------------------- |
| `GET_SETTINGS`                | any → SW             | Return merged settings.                            |
| `SETTINGS_CHANGED`            | options → SW         | Re-apply settings live (logger level, timeout).    |
| `PING`                        | popup → SW           | Keep-alive + stats snapshot.                       |
| `RESOLVE_COLLECTION_DOWNLOAD` | content → SW         | Resolve a collection file download URL.            |
| `RESOLVE_ARCHIVED_DOWNLOAD`   | content → SW         | Resolve an archived-file download URL.             |
| `START_DOWNLOAD`              | content → SW         | Start a browser download (URL re-validated).       |
| `COLLECTION_FINISHED`         | content → SW         | Record a finished collection run (stats).          |
| `FETCH_COLLECTION_MODS`       | content → SW         | GraphQL collection revision mods.                  |
| `FETCH_COLLECTION_REVISIONS`  | content → SW         | GraphQL collection revision list.                  |
| `GET_COLLECTION_HISTORY`      | content → SW         | Read per-collection download history.              |
| `SET_COLLECTION_HISTORY`      | content → SW         | Merge fileIds into history (atomic in SW; `replace: true` clears the list first). |

## Security model

- **Sender validation.** The service worker rejects every message whose
  `sender.id !== chrome.runtime.id` or whose `sender.url` is not a
  `www.nexusmods.com` page or an extension page (`isTrustedSender`,
  `src/background/handlers.js`). Untrusted messages get
  `{ success: false, error: 'Untrusted sender', code: 'INVALID_INPUT' }`.
- **URL allow-list.** Every URL that reaches `chrome.downloads.download` or is
  returned to the content script is validated by `isSafeDownloadUrl`
  (`src/nexus/url-utils.js`): parseable, `https:`, and a hostname on
  `nexusmods.com` / `*.nexusmods.com` or `nexus-cdn.com` / `*.nexus-cdn.com`.
  `nxm://` links are allowed for protocol-handler delivery. Resolvers
  extract-then-validate: a URL pulled from a response body that fails the
  allow-list is rejected with `INVALID_URL`, never handed off.
- **No content-side fetch.** The content script never calls the Nexus download
  endpoints directly; resolution always goes through the service worker, which
  owns timeouts, classification, and validation.
- **No credentials stored.** Settings and stats live in `chrome.storage.local`;
  session cookies stay in the browser context (requests use
  `credentials: 'include'`).

## Download resolution

`src/background/handlers.js` implements two resolvers; both share
`fetchWithTimeout` (AbortController, `settings.requestTimeout`, default 30 s)
and `extractValidatedUrl`:

1. `RESOLVE_COLLECTION_DOWNLOAD` — POST
   `https://www.nexusmods.com/Core/Libs/Common/Managers/Downloads?GenerateDownloadUrl`
   with `fid` / `game_id` / optional `nmm=1`. Used by the collection panel.
2. `RESOLVE_ARCHIVED_DOWNLOAD` — GET
   `https://www.nexusmods.com/{slug}/Core/Downloads/GenerateDownloadUrl?file_id=...`
   with optional `nmm=1`. Used by the archived-file and no-wait features.

Response classification (`extractValidatedUrl`):

- Body contains `cloudflare` / `cf-` → `CLOUDFLARE` (never bypassed).
- `404` → `FILE_NOT_FOUND`; `403` → `AUTH_ERROR`; other `>= 400` → error with
  status.
- JSON parsed for `url` / `URL` / `Url` / `data.URI` / `data.url`; a regex
  capture of `nxm://` or `https?://` is a text fallback and is still
  allow-list validated.
- No usable URL → `INVALID_RESPONSE`. Fetch failure → `NETWORK_ERROR`.
  Abort → `TIMEOUT`.

`nxm://` fallback links are built only from a real mod id
(`nxm://{domain}/mods/{modId}/files/{fileId}`); the resolver never fabricates
a `/mods/1/` placeholder.

## Errors

Defined in `src/shared/errors.js` (`ERROR_CODES`), attached to every failed
response as `code`: `AUTH_ERROR`, `CLOUDFLARE`, `REQUIREMENTS`,
`FILE_NOT_FOUND`, `NETWORK_ERROR`, `INVALID_RESPONSE`, `INVALID_URL`,
`TIMEOUT`, `INVALID_INPUT`, `NOT_ARCHIVED`, `UNKNOWN`. Content-script
`sendMessage` wrappers attach the code to the rejected `Error`.

## Content features

- `selectors.js` centralizes every Nexus DOM selector (with fallback chains)
  so a Nexus markup change has one repair point.
- **Archived files** (`no-wait.js`): injects Mod Manager / Manual download
  buttons into `.accordion-downloads` boxes without replacing native content;
  headers pair to boxes by shared ancestor (positional index is a last
  resort); the per-tick scan is O(n) with an early bail when all boxes are
  handled.
- **No-wait**: slow-download button bypass, auto-start, requirements-tab
  skip, auto-close. Resolution always via `RESOLVE_ARCHIVED_DOWNLOAD`; a
  failed resolve never navigates or reloads (no reload loop).
- **Settings reactivity**: `applyNoWaitFeatures(settings)` injects or removes
  each feature's DOM; toggling a feature off un-injects its buttons and
  listeners (requirements listener is removable), on re-injects.
- **Route cleanup**: on collection route change the old manager is
  `abort()`ed, stale modals and injected DOM are removed, and no-wait state is
  reset before the new panel is built.

## Collection downloader (`collection-ui.js`)

- Serial queue with a run mutex (`isRunning`): concurrent start attempts are
  ignored; the download method is snapshotted and the radio inputs disabled
  during a run.
- `abort()` stops the loop, clears the pacing timer, and restores the UI;
  the service worker's `SET_COLLECTION_HISTORY` merges history atomically
  (in-SW cache + serialized write chain), so concurrent runs cannot lose
  updates.
- Mod names are rendered with `textContent`/`createElement` everywhere
  (no HTML interpolation of server data).
- Progress bar, activity log, select-mods modal (search preserves checkbox
  selection), and revision-diff modal all live here.

## Settings & stats

`src/storage/settings.js` merges `DEFAULT_SETTINGS` (`src/storage/defaults.js`),
type-coerces every stored value against the schema, and stamps `__version`
(`STORAGE_VERSION`) — a version mismatch triggers a defaults re-merge and
persist. Stats (`collectionsDownloaded`, `autoDownloadsCompleted`) are
incremented by the service worker (`START_DOWNLOAD` success,
`COLLECTION_FINISHED`) and surfaced in the popup via `PING`.

## Building

`node scripts/build.mjs` bundles the ES-module sources with esbuild into a flat
`dist/chrome/` tree (content script + service worker as IIFEs, minified in
non-watch builds) and copies the manifest, HTML pages, styles, and icons.
`--watch` rebuilds JS and re-copies static assets on change. The root
`manifest.json` is the source of truth and is copied verbatim.
