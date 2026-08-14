# Security model

The extension's trust boundary is the service worker. Every message is validated at the door, every network response is extracted then re-validated, and the extension never holds credentials or bypasses Cloudflare.

## Sender validation (`isTrustedSender`, `src/background/handlers.js`)

`service-worker.js` runs `isTrustedSender(sender, chrome.runtime.id)` on every `chrome.runtime.onMessage` before dispatch. A message is trusted only when both hold:

- `sender.id === chrome.runtime.id` (same extension), and
- `sender.url` is either
  - a `chrome-extension://<runtimeId>/...` extension page (popup, options), or
  - an `https://www.nexusmods.com` page (content script).

Anything else — other extensions, arbitrary web pages, missing sender — is rejected with `{ success: false, error: 'Untrusted sender', code: 'INVALID_INPUT' }` and never reaches a handler.

## URL allow-list (`isSafeDownloadUrl`, `src/nexus/url-utils.js`)

`isSafeDownloadUrl(value)` returns true only if the value:

- parses as a `URL` (`parseUrlSafe`), and
- has protocol `https:` (`URL_SCHEME_HTTPS`), and
- has a hostname on `nexusmods.com` / `*.nexusmods.com` (`isNexusHost`) or `nexus-cdn.com` / `*.nexus-cdn.com` (`isCdnHost`).

`nxm://` URLs are accepted only by the resolver-side `isValidDownloadUrl` (scheme `nxm:` matching `/^nxm:\/\/[^\s/]+(?:\/|$)/i`) and only for protocol-handler delivery; the collection resolver builds them solely from a real mod id in the shape `nxm://{gameDomain}/mods/{modId}/files/{fileId}`. `NXDT_START_DOWNLOAD` does not accept `nxm://`: it re-checks with `isSafeDownloadUrl` only, so a protocol URL can never reach `chrome.downloads`.

## Extract-then-validate

`extractValidatedUrl` never trusts a URL found in a Nexus response. It pulls a candidate from the JSON keys (`url` / `URL` / `Url` / `data.URI` / `data.url`) or the text regex fallback, `&amp;`-decodes it, then re-runs `isValidDownloadUrl` before returning it. A candidate off the allow-list is discarded with `INVALID_URL`; the message flow never sees it. Full classification rules are in `errors.md`.

## No content-side fetch

Content scripts never call `fetch` against Nexus. They send `NXDT_RESOLVE_*` / `NXDT_FETCH_*` messages and the service worker performs all network I/O — both resolvers and `CollectionClient` (GraphQL) run in the SW with `credentials: 'include'` and an `AbortController` timeout. The content layer only manipulates the page DOM.

## No credentials stored

The extension persists only `settings`, `stats`, and `collection_history` in `chrome.storage.local`. No tokens, passwords, or API keys are stored. Session cookies remain in the browser and are sent implicitly by `credentials: 'include'` on host-permissioned fetches — the extension never reads, copies, or writes them.

## Cloudflare never bypassed

A response body containing `cloudflare` / `cf-` is classified `CLOUDFLARE` and surfaces as an error. There is no retry logic, header spoofing, challenge solving, or alternative ingress that would circumvent Cloudflare.

## `START_DOWNLOAD` re-validates before `chrome.downloads`

`startDownload` (handler for `NXDT_START_DOWNLOAD`):

1. Rejects a missing `url` payload with `INVALID_INPUT`.
2. Re-checks the URL with `isSafeDownloadUrl` — an off-list URL is rejected with `INVALID_URL` and `chrome.downloads` is never called.
3. Verifies `chrome.downloads.download` exists (else `UNKNOWN`).
4. Calls `chrome.downloads.download({ url, saveAs: false })`, consuming `chrome.runtime.lastError` on failure (mapped to `UNKNOWN`), and increments `stats.autoDownloadsCompleted` on success.

This second validation closes the gap between resolution and download: even a handler-level mistake or a tampered message cannot start an off-list download.

## See also

- [Getting started](../tutorial/getting-started.md)
- [Add a setting](../how-to/add-a-setting.md)
- [Add a message type](../how-to/add-a-message-type.md)
- [Debug and verify](../how-to/debug-and-verify.md)
- [Distribute](../how-to/distribute.md)
- [Architecture](architecture.md)
- [Message protocol](message-protocol.md)
- [Settings and storage](settings-and-storage.md)
- [Errors](errors.md)
- [Permissions](permissions.md)
- [Why the service worker owns everything](../explanation/why-the-service-worker-owns-everything.md)
- [How the download queue works](../explanation/how-the-download-queue-works.md)
- [Cloudflare and rate limits](../explanation/cloudflare-and-rate-limits.md)
- [The popup UX flow](../explanation/the-popup-ux-flow.md)
