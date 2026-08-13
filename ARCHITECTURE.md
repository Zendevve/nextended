# Architecture

## Layers

| Layer          | Location                     | Responsibility                                                                        |
| -------------- | ---------------------------- | ------------------------------------------------------------------------------------- |
| Content script | `src/content/`               | Page detection, DOM inspection, button injection, `MutationObserver`, click handling. |
| Background     | `src/background/`            | Message routing, download orchestration, privileged HTTP, browser downloads, state.   |
| Nexus          | `src/nexus/`                 | Nexus HTTP client, download resolver, URL/file/game parsers, requirements detection.  |
| Storage        | `src/storage/`               | `chrome.storage` settings + statistics.                                               |
| Shared         | `src/shared/`                | Constants, message factory, structured logger, typed errors.                          |
| UI             | `src/popup/`, `src/options/` | Extension popup and settings pages.                                                   |

## Message protocol

Content script → service worker (request/response):

```json
{
  "type": "NXDT_RESOLVE_DOWNLOAD",
  "payload": {
    "fileId": "123456",
    "gameId": "1704",
    "slug": "skyrimspecialedition",
    "mode": "manual"
  }
}
```

Responses use the `dispatch` envelope:

```json
{ "success": true,  "result": { "action": "download", "url": "https://files.nexus-cdn.com/...", "fileId": "123456" } }
{ "success": false, "error": "Nexus requires browser verification", "code": "CLOUDFLARE" }
```

Valid message types live in `src/shared/constants.js` (`MESSAGE_TYPES`). The service worker
only ever acts on `RESOLVE_DOWNLOAD` — it never trusts a URL supplied by the content script.

## URL security

Every resolved URL is validated by `isSafeDownloadUrl` before any privileged action:

- Must be a parseable URL.
- Must use `https:`.
- Hostname must match `nexusmods.com` / `*.nexusmods.com` or `nexus-cdn.com` / `*.nexus-cdn.com`.

Rejected schemes: `javascript:`, `data:`, `blob:`, `ftp:`, and any third-party host.

## Download resolution

`DownloadResolver.resolve(fileId, gameId, slug, mode)`:

1. Validates identifiers.
2. Delegates an HTTP call to `NexusClient.generateDownloadUrl` (the Nexus
   `Core/Downloads/GenerateDownloadUrl?file_id=...` endpoint, performed from the
   service worker with `credentials: include`).
3. Classifies the response via `analyzeResponse`:
   - Cloudflare challenge (`CLOUDFLARE`) — never bypassed; falls back to browser navigation.
   - Auth wall (`AUTH_ERROR`).
   - `404` → `FILE_NOT_FOUND`.
   - Requirements content → `REQUIREMENTS`.
4. Extracts the final URI from the JSON (`Data.URI` / `Data.URI2` / `data.url` …) or text fallback.
5. NXM manager URLs (`nxm://`) are returned with `protocol: 'nxm:'` and are opened by the
   content script (the OS mod-manager handler decides what happens).
6. HTTPS URLs are re-validated against the allow-list.

## Errors

Defined in `src/shared/errors.js`. Codes:

`AUTH_ERROR`, `CLOUDFLARE`, `REQUIREMENTS`, `FILE_NOT_FOUND`, `NETWORK_ERROR`,
`INVALID_RESPONSE`, `INVALID_URL`, `TIMEOUT`, `INVALID_INPUT`, `NOT_ARCHIVED`, `UNKNOWN`.

Errors are structured (`code` + `context`) and surfaced through the button state machine:

```
READY → RESOLVING → DOWNLOADING → SUCCESS  (auto-reset to READY)
              ↘ REQUIREMENTS / CLOUDFLARE / AUTH_ERROR / NETWORK_ERROR / …
                     → ERROR (with inline fallback link where applicable)
```

## Settings

Stored with `chrome.storage.local` (never credentials/session cookies). Defaults in
`src/storage/defaults.js`. The service worker re-reads settings and adjusts the logger
level and resolver timeout live when `NXDT_SETTINGS_CHANGED` is observed.

## Building

`node scripts/build.mjs` bundles the ES-module sources with esbuild into a flat
`dist/chrome/` tree (content script + service worker as IIFEs) and copies the manifest,
HTML pages, styles, and icons. The root `manifest.json` is the source of truth and is copied
verbatim into `dist/chrome/`.
