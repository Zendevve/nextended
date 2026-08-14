# Cloudflare and Rate Limits

Nexus Mods sits behind Cloudflare, and the extension's download-resolution requests travel through it every time. This page explains how the extension detects Cloudflare interference, why it never tries to bypass it, and why the request pattern — pacing, headers, credentials — is shaped the way it is.

## Detecting Cloudflare: the body sniff

Both resolution endpoints (`RESOLVE_ARCHIVED_DOWNLOAD` on `GenerateDownloadUrl`, `RESOLVE_COLLECTION_DOWNLOAD` on `.../Downloads?GenerateDownloadUrl`) return their result through `extractValidatedUrl` (`src/background/handlers.js`). Its classification order is: 404 first, then the body sniff, then status-based codes:

```js
if (response.status === 404) { /* FILE_NOT_FOUND */ }
if (/cloudflare|cf-/i.test(text)) {
  throw new NexusDownloadError(ERROR_CODES.CLOUDFLARE, 'Blocked by Cloudflare');
}
if (response.status === 403) { /* AUTH_ERROR */ }
```

The sniff runs before the 403 check, deliberately. A Cloudflare challenge can arrive as a 403 page *or* as a 200 page that renders a JavaScript challenge — a plain status-code check would misclassify the 200 variant as a successful response and then fail confusingly on URL extraction. Checking the body for the `cloudflare` / `cf-` signature before the 403 check means both challenge shapes collapse to one code, `CLOUDFLARE` (`src/shared/errors.js`). A real 404 keeps its own meaning (`FILE_NOT_FOUND`), and a 403 without the signature is `AUTH_ERROR`.

## The never-bypass policy

The extension **never bypasses** a challenge. It does not retry faster, spoof a browser user-agent, solve puzzles, or route around the check — there is no code path that treats a `CLOUDFLARE` result as anything but a failure. The reasoning:

- The only session that exists is the user's real browser session (see below). A challenge means Cloudflare is asking *that* session to prove it's human; no header or cookie the extension could fabricate is a legitimate answer.
- A bypass would be fragile (Cloudflare changes challenge shapes constantly), fragile in the other direction too (it would look like exactly the bot traffic the challenge exists to stop), and it would put the extension in the business of evading the site's protections. That is a line the extension does not cross.
- The correct fallback is normal browser navigation: the user opens Nexus in their own tab, where a real click through a real page usually passes or is solved by the user directly. The no-wait automation still injects the download buttons, but a failed resolve never navigates, never reloads, and never falls back to a raw URL guess — it just reports the failure in the collection log console and the queue continues.

## AUTH_ERROR: the session is the user's, or it isn't

The worker's fetches use `credentials: 'include'`, so the browser attaches the user's `nexusmods.com` cookies to every resolution request. The extension stores **no credentials**: no `cookies` permission, no session tokens in `chrome.storage`, nothing to refresh or re-issue. The request is only as authorized as the user's current browser session.

A 403 without a Cloudflare signature means the session itself is the problem — `AUTH_ERROR` (`errors.js`). Typically the Nexus login expired, or the file requires an account the session doesn't have. There is nothing the extension can do but report it, because it has no independent notion of "logged in"; the user re-authenticates in the browser and re-runs. This is the deliberate payoff of the design in [Why the service worker owns everything](./why-the-service-worker-owns-everything.md): the extension is a proxy for the user's session, never a custodian of it, so it has no credential-handling code to get wrong.

## FILE_NOT_FOUND: archived files disappear

A 404 from the resolution endpoint is classified before JSON parsing as `FILE_NOT_FOUND` (`errors.js`). Files on Nexus are routinely hidden or removed — author takedowns, moderation actions, file replacements. The queue treats this as a per-file failure: logged, added to the failed list, the run continues, and the file is never recorded in history, so a re-run can pick it up if it ever returns (see [How the download queue works](./how-the-download-queue-works.md)).

## Pacing as rate-limit hygiene

The queue never issues parallel resolution requests, and between files it waits:

```js
Math.round(fileSizeKB / 1024 / this.downloadSpeed) + this.pauseBetweenDownload
```

The `pauseBetweenDownload` component (default **1.5 s**) is a hard floor; the size component scales with the file just started. The floor exists because even a modest collection produces a burst of near-identical `GenerateDownloadUrl` requests, and bursts are the statistical signature Cloudflare's bot heuristics key on. The floor guarantees a minimum gap between requests regardless of file size; the size component keeps the gap proportional to actual download activity. The settings exist so users can trade politeness for throughput — `collectionPauseBetweenDownload: 0` disables the pause entirely — but the default deliberately errs on the side of not tripping the protection this extension depends on.

The same hygiene applies to retries: a `CLOUDFLARE` result ends that file's attempt within the run. There is no automatic retry-on-challenge, because an immediate retry is precisely the behavior that produces a longer ban.

## Why the headers are what they are

`RESOLVE_COLLECTION_DOWNLOAD` sends:

- `Content-Type: application/x-www-form-urlencoded; charset=UTF-8` — the endpoint's expected body encoding (`fid=..&game_id=..[&nmm=1]`);
- `X-Requested-With: XMLHttpRequest` — the marker the site's own client sends for its AJAX endpoints;
- `Origin: https://www.nexusmods.com` — declaring the request originates from the site itself, as the site's own client does.

`RESOLVE_ARCHIVED_DOWNLOAD` sends `X-Requested-With: XMLHttpRequest` on its GET. These are the same signals a normal Nexus page sends. Omitting them is not a privacy win — it is how you get served an HTML login page or a generic 403 instead of a JSON answer. They are not "browser impersonation"; they are *correct client behavior* for the endpoint in question.

`credentials: 'include'` is the third piece: it is what carries the user's session cookies with the request, which is also exactly why `AUTH_ERROR` means "your session, not ours." The extension holds no credentials; the browser's cookie jar does the authenticating.

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
- [Why the service worker owns everything](./why-the-service-worker-owns-everything.md)
- [How the download queue works](./how-the-download-queue-works.md)
- [The popup UX flow](./the-popup-ux-flow.md)
