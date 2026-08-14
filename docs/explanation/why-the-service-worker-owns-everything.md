# Why the Service Worker Owns Everything

Every privileged operation in this extension runs in the service worker — never in the content script, never in the popup. This is not a style choice; it is the consequence of the MV3 trust model. The service worker is the only context that (a) survives the page, (b) can be relied on to exist when a request arrives, and (c) can hold a consistent policy for "what are we allowed to touch."

## The MV3 lifecycle is ephemeral, and that is fine

In Manifest V3 the background context is a service worker (`manifest.json`: `"background": { "service_worker": "background/service-worker.js", "type": "module" }`). The browser can terminate it at any moment — after idle periods, on memory pressure, on suspend. Nothing in the extension can prevent that, and nothing should try. The worker must instead be *reconstructible*: the browser wakes it on demand whenever an event targeting it arrives, and the worker rebuilds its state from scratch.

Two consequences drive the design:

- **All state lives in storage, not in globals.** On every wake, `init()` in `src/background/service-worker.js` re-reads settings via `getSettings()` and rebuilds the `CollectionClient` (with the configured `requestTimeout`) through `refreshClients()`. A terminated worker does not lose anything, because it never kept anything it couldn't recreate.
- **The message listener is the front door.** `chrome.runtime.onMessage.addListener` in `service-worker.js` is the entry point for every interaction. It validates the sender *before* dispatch, not inside individual handlers — one choke point, applied uniformly. Handlers registered in `registerHandlers()` (`src/background/handlers.js`) then carry the actual work.

Because the worker can be cold-started by any message, the sender check cannot rely on "we were already running and I remember this frame." It must be a pure function of the message envelope: `sender.id === chrome.runtime.id` and `sender.url` is either an extension page or an exact `https://www.nexusmods.com` page (`isTrustedSender`, `src/background/handlers.js`). That is the whole trust model, stated once.

## The trust boundary: the page is hostile territory

The content script runs in an **ISOLATED world** (manifest: `"world": "ISOLATED"`) — same DOM, separate JavaScript environment. The page's own scripts, ad bundles, analytics, and anything a compromised mod author smuggles into a description all execute in the page's main world. They share the DOM with the content script but cannot call `chrome.*` or read the content script's variables.

That boundary inverts the usual threat model. The content script is *inside* hostile territory: it reads the DOM that the page controls, and it observes mutations via `page-observer.js`. The page can rewrite the DOM at any time. So the content script is treated as untrusted-by-proximity: it may *ask* for things, but it never decides whether a thing is safe. Concretely, the content script never:

- calls `chrome.downloads` (only the worker's `startDownload` handler does, after re-validating the URL);
- performs privileged fetches with session cookies on its own (all `GenerateDownloadUrl` and GraphQL requests go through the worker);
- holds, caches, or forwards credentials (it has nothing to hold — see [Cloudflare and Rate Limits](./cloudflare-and-rate-limits.md)).

Every ask crosses the boundary as an `NXDT_*` message and gets the same treatment: sender validated at the listener, payload validated in the handler, and for anything that touches `chrome.downloads`, the URL validated *again* — the worker does not trust its own previous answer. `startDownload` re-runs `isSafeDownloadUrl(payload.url)` (`src/nexus/url-utils.js`: parseable, `https:`, hostname on `nexusmods.com` / `*.nexusmods.com` / `nexus-cdn.com` / `*.nexus-cdn.com`) immediately before `chrome.downloads.download({ url, saveAs: false })`. And `extractValidatedUrl` re-validates whatever URL was extracted from a server response before it is ever handed back to the content script. A URL is only ever trusted at the moment it is used.

## What this protects against

- **Page-injected scripts.** A script running on a Nexus page lives in the main world. It can mutate the DOM the content script observes — hiding buttons, fabricating log entries, renaming mods. Because the content script renders server data as text (`textContent`, never HTML interpolation) and never treats DOM content as instructions, DOM manipulation can confuse the UI but cannot cause a download of an arbitrary URL. The only path to `chrome.downloads` is a worker handler that re-validates the URL against the allow-list.
- **Forged messages from Nexus pages.** Any content script instance on a `www.nexusmods.com` page can send `chrome.runtime` messages — that is by design. The listener check (`isTrustedSender`) is what keeps that channel honest: the sender must be an extension page or exactly `https://www.nexusmods.com`, never a lookalike domain, never a subdomain other than `www`, never a page loaded over `http:`. A phishing page on `nexusmods-downloads.xyz` gets `{ success: false, code: 'INVALID_INPUT' }` before dispatch even runs.
- **Malicious mod names.** Collection data comes from the GraphQL API and is server-controlled; a mod author can name a file almost anything. The queue renders those names as text and logs them with `textContent`-style output, so a name like `<img src=x onerror=...>` is inert. The worker never logs, parses, or interpolates names into URLs — URLs come only from `extractValidatedUrl`, which extract-then-validates and rejects anything off the allow-list (`INVALID_URL`).
- **XSS via server data.** The GraphQL responses and the `GenerateDownloadUrl` responses are attacker-influenceable data. The worker treats them as data: JSON keys are read defensively (`url` / `URL` / `Url` / `data.URI` / `data.url`), the fallback regex capture is still allow-list validated, and the content script renders every string via `createElement`/`textContent`. There is no code path where server data becomes markup or a URL without passing the allow-list.

## Credentials never leave the browser's cookie jar

The worker's fetches use `credentials: 'include'` — the browser attaches the user's existing `nexusmods.com` cookies automatically. The extension has no `cookies` permission, no session token in storage, nothing to leak and nothing to refresh. If the session is missing or expired, the request fails with `AUTH_ERROR` and the user logs in through the browser normally. The worker is a proxy for the user's real session, not a holder of it.

## See also

**Tutorial**
- [Getting started](../tutorial/getting-started.md)

**How-to**
- [Add a setting](../how-to/add-a-setting.md)
- [Add a message type](../how-to/add-a-message-type.md)
- [Debug and verify](../how-to/debug-and-verify.md)
- [Distribute](../how-to/distribute.md)

**Reference**
- [Architecture](../reference/architecture.md)
- [Message protocol](../reference/message-protocol.md)
- [Settings and storage](../reference/settings-and-storage.md)
- [Errors](../reference/errors.md)
- [Permissions](../reference/permissions.md)
- [Security model](../reference/security-model.md)

**Explanation**
- [How the download queue works](./how-the-download-queue-works.md)
- [Cloudflare and rate limits](./cloudflare-and-rate-limits.md)
- [The popup UX flow](./the-popup-ux-flow.md)
