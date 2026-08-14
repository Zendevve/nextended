# How the Download Queue Works

The collection downloader is a strictly serial queue: one file at a time, in order, with deliberate pacing between files. It lives in the content script (`CollectionManager`, `src/content/collection-ui.js`) and delegates every privileged step to the service worker. This page explains the mechanics and the reasoning behind each rule — the message names and endpoints are covered in the reference.

## Serial queue with a run mutex

`downloadMods(modsList, type)` is the only entry point. It refuses re-entry outright:

```js
if (this.isRunning) {
  log.warn('Download already in progress, ignoring request.');
  return;
}
this.isRunning = true;
```

The mutex matters because a collection page offers several ways to start a run — Download All, Mandatory (N), Select Mods — and they share the same progress bar. Without the guard, two runs would interleave downloads and double-write history. The queue is serial because Nexus's download endpoints expect one conversation at a time and because `chrome.downloads` in the worker can only start one file per `START_DOWNLOAD` round trip anyway; there is no parallelism to win.

## `runToken`: invalidating stale runs

Async code can't observe a stop at the exact instruction it happens — a `sendMessage` round trip may be in flight when the user clicks Stop. `CollectionManager` handles this with a monotonically increasing token:

```js
const runToken = ++this.runToken;
```

Every `await` boundary in the loop checks `this.aborted || runToken !== this.runToken` and breaks. `abort()` increments `this.runToken`, so any stale loop sees the mismatch at its next boundary and stops itself. The same check protects teardown: the `finally` block calls `endDownload()` and resets `isRunning` only `if (runToken === this.runToken)`, so a stale run can never tear down the UI of a newer run. Route changes use the same mechanism — `processCollectionPage` in `src/content/nexus-content.js` aborts the old manager before building a new panel.

## Per-collection history: dedupe by auto-skip

Before resolving each mod, the run reads the per-collection history from the worker (`GET_COLLECTION_HISTORY`) and checks the file id:

```js
if (downloadedHistory.includes(fileId)) {
  this.console.log(`[${modNumber}] Skipped (already downloaded): ${modName}`);
  this.progressBar.incrementProgress();
  continue;
}
```

History is keyed by `gameDomain` / `collectionSlug` / `type`, where `type` is the run type (`all`, `mandatory`, or `selected` — Download All, Mandatory (N), or Select Mods) — i.e., the list that was actually run. Previously downloaded file ids are skipped silently — no confirm dialog — and still count toward the progress bar, so "12/30" reads as "12 of 30 files are done" rather than "12 of 30 *attempted*".

The skip is only as trustworthy as the history write, which is why the content script never writes history directly. `SET_COLLECTION_HISTORY` goes to the worker, which performs an atomic merge: an in-memory cache loaded once, then a serialized write chain (`historyWriteChain`) so concurrent updates can't clobber each other, with blocklist guards on `__proto__` / `constructor` / `prototype` in `setCollectionHistory` (`src/background/handlers.js`). History is recorded *only* after a download actually started — `nxm://` handed to the mod manager, or `START_DOWNLOAD` resolved `{ success: true }` — never on failure, never on skip.

## Pacing: why there is a formula at all

Between files the queue waits:

```js
const calcPause = this.pauseBetweenDownload === 0
  ? 0
  : Math.round(fileSizeKB / 1024 / this.downloadSpeed) + this.pauseBetweenDownload;
```

Defaults: `collectionDownloadSpeed` = 1.5 (MB/s), `collectionPauseBetweenDownload` = 1.5 (s). The size component approximates the time the file just started would take to download at the configured speed; the floor component guarantees a minimum gap. Pacing exists because a full collection run fires dozens of `GenerateDownloadUrl` requests back-to-back, and bursts of identical automated requests are exactly what Nexus/Cloudflare classify as scraping — which degrades into challenges and 403s (see [Cloudflare and Rate Limits](./cloudflare-and-rate-limits.md)). The pause is the extension's main "politeness" lever, and it is configurable precisely because the right value depends on the user's connection and tolerance.

## Pause, Resume, Skip Wait, Stop

The countdown is a `setInterval` ticking once per second. The progress bar status field arbitrates:

- **Pause** (`#nxdtPlayPause` → `STATUS_PAUSED`): the tick returns without decrementing `remaining`, so the countdown freezes in place. The timer itself keeps running — pausing doesn't cancel the pause.
- **Resume**: the same button flips status back to `STATUS_DOWNLOADING`; the next tick continues decrementing.
- **Skip Wait** (`#nxdtSkipPause`): sets `skipPause`, which the next tick sees and resolves the wait immediately. The `skipPause` flag is reset after use so it doesn't silently skip a later pause.
- **Stop** (`#nxdtStop` → `abort()`): increments `runToken`, sets `aborted`, clears the interval, resolves the pause promise to unblock the loop, and restores the UI.

These controls matter because a collection can be hundreds of files: pausing is how you let the connection catch up or the browser's own download manager drain, and skipping a single long wait (after a huge file) is how you keep a run moving without aborting the whole queue.

## Abort semantics

`abort()` is a full stop, not a pause:

1. `runToken++` and `aborted = true` — any in-flight loop observes this at its next boundary.
2. The pause timer is cleared (`clearInterval`) and the pause promise resolved — a loop blocked in the countdown can't hang.
3. UI is restored: progress bar hidden, download controls shown, method radios re-enabled (`setRadiosDisabled(false)`), status set to `STATUS_STOPPED`, and "Download queue stopped by user." logged.

The critical invariant: **`COLLECTION_FINISHED` is never sent after an abort.** It is sent from `endDownload()` only when the run completed without `aborted`, and `endDownload` only runs when the token is still current. `COLLECTION_FINISHED` increments `stats.collectionsDownloaded` in the worker (`collectionFinished`, `src/background/handlers.js`), so a stopped run must never count as a finished collection. `endDownload()` also refuses to overwrite `STATUS_STOPPED` with `STATUS_FINISHED` — the UI shows what actually happened.

## Failed downloads: logged, continued, never recorded

A mod whose URL fails to resolve (`RESOLVE_COLLECTION_DOWNLOAD` returns no `url`) or whose `START_DOWNLOAD` returns `{ success: false }` produces an ERROR log line and is pushed onto `failedDownloads`. The loop continues with the next mod; one dead file doesn't strand a 200-file collection. At the end, the console summarizes: "Failed to resolve N mod downloads."

Failed mods are deliberately **not** written to history. `updateHistory(type, fileId)` runs only on the success paths (after the `nxm://` iframe handoff or after `START_DOWNLOAD` succeeds). That is what makes a retry meaningful: a re-run will attempt the failed files again, and only the ones that actually started are skipped. Failures are also the only place the queue surfaces errors to the user beyond the log — errors appear as log entries with the `nxdt-log-entry-error` class, so a failed run's summary is visible at a glance.

## Server data is rendered, never executed

Every string that arrives from the GraphQL API or a resolution response — mod names, file names, error messages — is rendered via `createElement`/`textContent`, and the log console appends entries the same way. There is no HTML interpolation anywhere in the queue. A mod author can name a file anything; the worst it can do is look odd in the log.

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
- [Cloudflare and rate limits](./cloudflare-and-rate-limits.md)
- [The popup UX flow](./the-popup-ux-flow.md)
