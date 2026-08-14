# Message protocol

Content scripts and the popup talk to the service worker through `chrome.runtime.sendMessage`; the service worker answers through `sendResponse`. The popup talks to the content script directly (not through the service worker) for exactly one message: `NXDT_FOCUS_COLLECTION_PANEL`.

## Envelope

Request:

```js
{ type: 'NXDT_...', payload: { ... } }
```

Built by `createMessage(type, payload)` in `src/shared/messages.js` (payload defaults to `{}`); `MessageFactory` exposes `ping`, `getSettings`, `settingsChanged`.

Dispatch response (`src/background/message-router.js`):

```js
// success
{ success: true, result: <handler return value> }
// failure
{ success: false, error: '<message>', code: '<ERROR_CODE>' }
```

An unhandled `type` resolves to `{ error: 'Unhandled message type: <type>' }`. An untrusted sender is rejected before dispatch with `{ success: false, error: 'Untrusted sender', code: 'INVALID_INPUT' }`. `code` is always one of `ERROR_CODES` (see `errors.md`).

## Message types

| Type | Direction | Purpose | Payload / response highlights |
|---|---|---|---|
| `NXDT_PING` | popup → SW | Keep-alive + stats snapshot for the popup header | result: `{ alive: true, stats }`; `stats` has `collectionsDownloaded`, `autoDownloadsCompleted` |
| `NXDT_GET_SETTINGS` | any trusted sender → SW | Fetch merged, coerced, version-stamped settings | result: `{ settings }` |
| `NXDT_SETTINGS_CHANGED` | options → SW | Re-apply logger level and request timeout live; popup refreshes on it | payload `{ settings }`; handler calls `refreshClients()`, returns `{ ok: true }` |
| `NXDT_RESOLVE_ARCHIVED_DOWNLOAD` | content → SW | Resolve an archived file to a download URL | payload `{ fileId, slug, isNMM }`; result `{ url, fileId }` or `{ url: null, error, code }` |
| `NXDT_RESOLVE_COLLECTION_DOWNLOAD` | content → SW | Resolve a collection mod file to a download URL | payload `{ fileId, gameId, gameDomain, isNMM, modId }`; result `{ url, fileId }` or `{ url: null, error, code }`; NMM fallback builds `nxm://{domain}/mods/{modId}/files/{fileId}` |
| `NXDT_START_DOWNLOAD` | content → SW | Start a browser download | payload `{ url }`; URL re-validated with `isSafeDownloadUrl`; result `{ success, downloadId }` |
| `NXDT_COLLECTION_FINISHED` | content → SW | Record a completed collection run | increments `stats.collectionsDownloaded`; returns `{ ok: true }`; sent only after a successful full run, never after abort |
| `NXDT_FETCH_COLLECTION_MODS` | content → SW | Fetch collection revision mod files via GraphQL | payload `{ gameDomain, collectionSlug, revision }`; result `{ collectionRevision }` |
| `NXDT_FETCH_COLLECTION_REVISIONS` | content → SW | Fetch revision list via GraphQL | payload `{ gameDomain, collectionSlug }`; result `{ revisions }` |
| `NXDT_GET_COLLECTION_HISTORY` | content → SW | Read per-collection downloaded fileId history | result `{ history }`; nested `gameDomain → collectionSlug → type → fileIds` |
| `NXDT_SET_COLLECTION_HISTORY` | content → SW | Record downloaded fileIds for a collection | payload `{ gameDomain, collectionSlug, type, fileIds, replace? }`; atomic merge in SW; `replace: true` clears the list first; blocklist guards `__proto__|constructor|prototype`; result `{ ok: true }` / `{ ok: false, error, code: 'INVALID_INPUT' }` |
| `NXDT_FOCUS_COLLECTION_PANEL` | popup → content script (NOT via SW) | Scroll the collection panel into view and flash focus | `chrome.tabs.sendMessage(id, { type: NXDT_FOCUS_COLLECTION_PANEL })`; content script `scrollIntoView({ behavior: 'smooth', block: 'center' })` on `[data-nxdt-collection]`, adds `nxdt-panel-focus` for 1600 ms; responds `{ ok: true }` / `{ ok: false }` |

## Resolver endpoints

Archived (GET, built by `buildGenerateDownloadUrl` in `src/nexus/url-utils.js`):

```
https://www.nexusmods.com/{slug}/Core/Downloads/GenerateDownloadUrl?file_id={id}[&nmm=1]
```

`&nmm=1` is appended when `isNMM` is true. Headers: `X-Requested-With: XMLHttpRequest`; `credentials: 'include'`.

Collection (POST):

```
https://www.nexusmods.com/Core/Libs/Common/Managers/Downloads?GenerateDownloadUrl
```

- Body: `fid=<fileId>&game_id=<gameId>[&nmm=1]` (URL-encoded form)
- Headers: `Content-Type: application/x-www-form-urlencoded; charset=UTF-8`, `X-Requested-With: XMLHttpRequest`, `Origin: https://www.nexusmods.com`
- `credentials: 'include'`

Both honor `settings.requestTimeout` (default 30000 ms) via `AbortController`. Responses go through `extractValidatedUrl` (classification rules in `errors.md`) and the extracted URL is re-validated against the allow-list before it is returned (see `security-model.md`).

## See also

- [Getting started](../tutorial/getting-started.md)
- [Add a setting](../how-to/add-a-setting.md)
- [Add a message type](../how-to/add-a-message-type.md)
- [Debug and verify](../how-to/debug-and-verify.md)
- [Distribute](../how-to/distribute.md)
- [Architecture](architecture.md)
- [Settings and storage](settings-and-storage.md)
- [Errors](errors.md)
- [Permissions](permissions.md)
- [Security model](security-model.md)
- [Why the service worker owns everything](../explanation/why-the-service-worker-owns-everything.md)
- [How the download queue works](../explanation/how-the-download-queue-works.md)
- [Cloudflare and rate limits](../explanation/cloudflare-and-rate-limits.md)
- [The popup UX flow](../explanation/the-popup-ux-flow.md)
