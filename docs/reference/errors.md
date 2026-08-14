# Errors

`ERROR_CODES` in `src/shared/errors.js` defines eleven codes, all string constants identical to their key names. Every failed dispatch response carries `code`; content-script `sendMessage` wrappers attach the code to the rejected `Error`. Structured errors are `NexusDownloadError` instances (`name: 'NexusDownloadError'`, fields `code`, `message`, `context`; `toJSON()` serializes them; `errorFromCode()` constructs, `isNexusError()` tests).

## Codes

| Code | When it surfaces |
|---|---|
| `AUTH_ERROR` | Resolver response status 403 (no Cloudflare marker in body) — authentication required |
| `CLOUDFLARE` | Resolver response body contains `cloudflare` or `cf-` — a 403 or 200 challenge page; never bypassed |
| `REQUIREMENTS` | Defined in `ERROR_CODES`; reserved — not raised by current handlers (semantic: requirement-blocked flows gated by `skipRequirements`) |
| `FILE_NOT_FOUND` | Resolver response status 404 (checked before the Cloudflare sniff, so a 404 with a `cf-` body is still `FILE_NOT_FOUND`) |
| `NETWORK_ERROR` | Fetch rejected with a non-`NexusDownloadError`, non-abort error; fallback code for unexpected failures |
| `INVALID_RESPONSE` | Resolver succeeded (status < 400) but the body contained no usable URL and the text fallback matched nothing (non-NMM path; an NMM request with no `modId` instead yields `INVALID_URL`) |
| `INVALID_URL` | Extracted or submitted URL fails the allow-list (`isSafeDownloadUrl` / `isValidDownloadUrl`), including `nxm://` built without a real mod id |
| `TIMEOUT` | Fetch aborted by the `AbortController` after `settings.requestTimeout` (default 30000 ms) |
| `INVALID_INPUT` | Untrusted sender; missing/invalid payload fields (e.g. resolver without `fileId`, `SET_COLLECTION_HISTORY` with bad shape or a `__proto__|constructor|prototype` key); `START_DOWNLOAD` without `url` |
| `NOT_ARCHIVED` | Defined in `ERROR_CODES`; reserved — not raised by current handlers (semantic: non-archived-file flows gated by `handleArchivedFiles`) |
| `UNKNOWN` | Any other status ≥ 400 (message `Nexus responded with status <N>`); `chrome.downloads` unavailable or failing; default code when none is supplied |

## Resolver classification (`extractValidatedUrl` in `src/background/handlers.js`)

Order of checks, applied to the raw response text:

1. Status 404 → `FILE_NOT_FOUND`.
2. Body matches `/cloudflare|cf-/i` → `CLOUDFLARE` (a plain 404/403 carrying a `cf-` string keeps its status code).
3. Status 403 → `AUTH_ERROR`.
4. Any other status ≥ 400 → error with the status (code `UNKNOWN`).
5. Otherwise parse JSON; candidate keys tried in order: `url`, `URL`, `Url`, `data.URI`, `data.url`.
6. No JSON key found → text fallback: first regex capture of `nxm://` or `https?://` from the body.
7. Candidate URL is `&amp;`-decoded, then re-validated with `isValidDownloadUrl` (allow-list); a failing URL → `INVALID_URL`.
8. No URL at all → `INVALID_RESPONSE`.

Outside `extractValidatedUrl`: fetch rejection → `NETWORK_ERROR`; `AbortError` → `TIMEOUT` (both via `resolveFailure`).

## See also

- [Getting started](../tutorial/getting-started.md)
- [Add a setting](../how-to/add-a-setting.md)
- [Add a message type](../how-to/add-a-message-type.md)
- [Debug and verify](../how-to/debug-and-verify.md)
- [Distribute](../how-to/distribute.md)
- [Architecture](architecture.md)
- [Message protocol](message-protocol.md)
- [Settings and storage](settings-and-storage.md)
- [Permissions](permissions.md)
- [Security model](security-model.md)
- [Why the service worker owns everything](../explanation/why-the-service-worker-owns-everything.md)
- [How the download queue works](../explanation/how-the-download-queue-works.md)
- [Cloudflare and rate limits](../explanation/cloudflare-and-rate-limits.md)
- [The popup UX flow](../explanation/the-popup-ux-flow.md)
