# Settings and storage

All persistent state lives in `chrome.storage.local` under three keys, declared in `src/shared/constants.js`:

| Storage key | Constant | Contents |
|---|---|---|
| `settings` | `STORAGE_KEY_SETTINGS` | 13 settings + `__version` |
| `stats` | `STORAGE_KEY_STATS` | `collectionsDownloaded`, `autoDownloadsCompleted` |
| `collection_history` | `STORAGE_KEY_COLLECTION_HISTORY` | Nested per-collection downloaded fileId history |

## Settings

Schema and defaults in `src/storage/defaults.js` (`DEFAULT_SETTINGS`):

| Key | Default | Effect |
|---|---|---|
| `enabled` | `true` | Master switch for all extension behavior |
| `handleCollections` | `true` | Build/run the collection downloader panel on collection pages |
| `collectionDownloadMethod` | `0` | `0` = `DOWNLOAD_METHOD_VORTEX`, `1` = `DOWNLOAD_METHOD_BROWSER`; how collection downloads are delivered |
| `collectionDownloadSpeed` | `1.5` | Estimated speed (MB/s) used to compute the pause between mods |
| `collectionPauseBetweenDownload` | `1.5` | Base pause (s) between mods; actual pause = `round(sizeKB / 1024 / speedMBps) + pauseBetweenDownload` (0 disables the pause) |
| `autoStartDownload` | `true` | Auto-start archived-file downloads; also powers the popup "Countdown Skip" toggle |
| `autoCloseTab` | `false` | Close the download tab automatically after the countdown |
| `skipRequirements` | `true` | Skip the requirements tab / requirement-blocked flows |
| `forceModManagerDownload` | `true` | Prefer Mod Manager delivery (nmm) for downloads |
| `handleArchivedFiles` | `true` | Inject Mod Manager / Manual buttons into archived-file accordions |
| `closeTabDelay` | `2000` | Delay (ms) before closing the tab after download start |
| `debugLogging` | `false` | Raise the logger level to `LOG_LEVELS.DEBUG` (re-applied live on `SETTINGS_CHANGED`) |
| `requestTimeout` | `30000` | Fetch timeout (ms) for resolver requests (re-applied live on `SETTINGS_CHANGED`) |

Stats (`DEFAULT_STATS` in `defaults.js`):

| Key | Default | Incremented by |
|---|---|---|
| `collectionsDownloaded` | `0` | `NXDT_COLLECTION_FINISHED` |
| `autoDownloadsCompleted` | `0` | `NXDT_START_DOWNLOAD` success (`incrementStat('autoDownloadsCompleted', 1)`) |

## Read and write semantics (`src/storage/settings.js`)

- `getSettings()`: reads `settings`, coerces each key against the schema (`coerceSetting`: booleans via `!!value`, numbers via `Number(value)` falling back when not finite, others via `String`), merges over `DEFAULT_SETTINGS`, stamps `__version`, and returns the merged object.
- `STORAGE_VERSION = 1`. If the stored `__version` differs, the merged defaults are persisted again and returned (version migration: re-merge + persist).
- `setSettings(settings)` merges over `DEFAULT_SETTINGS` and stamps `__version` before writing. `updateSettings(patch)` reads then writes. `resetSettings()` restores `DEFAULT_SETTINGS`.
- Writes are read-merge-write on `chrome.storage.local` only; other keys are never touched.
- The content script listens to `chrome.storage.onChanged` on the `settings` key: it re-applies no-wait features and reprocesses the collection page.

## Collection history

Structure: `history[gameDomain][collectionSlug][type] = fileIds[]`.

- `getCollectionHistory()` returns the whole nested object, lazily loaded once into an in-memory cache (`historyCache`).
- `setCollectionHistory(payload)`: payload `{ gameDomain, collectionSlug, type, fileIds, replace? }`.
  - Missing fields, a non-boolean `replace`, or a key matching `^(__proto__|constructor|prototype)$` → `{ ok: false, error: 'Invalid history payload', code: 'INVALID_INPUT' }`.
  - `fileIds` are stringified and deduped.
  - `replace: true` → `collection[type] = ids` (clears the existing list first).
  - otherwise → append-only merge: ids not already in the list are pushed.
  - Persisted through a serialized write chain (`historyWriteChain`), so concurrent writes cannot interleave; failures are logged, never thrown.
- `resetHistoryCache()` drops the in-memory cache (used in tests).

## See also

- [Getting started](../tutorial/getting-started.md)
- [Add a setting](../how-to/add-a-setting.md)
- [Add a message type](../how-to/add-a-message-type.md)
- [Debug and verify](../how-to/debug-and-verify.md)
- [Distribute](../how-to/distribute.md)
- [Architecture](architecture.md)
- [Message protocol](message-protocol.md)
- [Errors](errors.md)
- [Permissions](permissions.md)
- [Security model](security-model.md)
- [Why the service worker owns everything](../explanation/why-the-service-worker-owns-everything.md)
- [How the download queue works](../explanation/how-the-download-queue-works.md)
- [Cloudflare and rate limits](../explanation/cloudflare-and-rate-limits.md)
- [The popup UX flow](../explanation/the-popup-ux-flow.md)
