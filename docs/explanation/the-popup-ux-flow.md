# The Popup UX Flow

The popup (`src/popup/popup.js`, `src/popup/popup.html`) is a small command surface: three action rows, a status dot, a stats line, and a Settings button. This page explains why each row is an *action* rather than a status display, and how the popup gets the information it needs without asking for broad permissions.

## Where the popup's knowledge comes from: `activeTab`

The popup knows which site you're on without the `tabs` permission. When the user clicks the toolbar action (or presses the `_execute_action` shortcut, Ctrl+Shift+Y), Chrome grants **`activeTab`** for the duration of that popup session — access to the active tab's `url` and `title`. `getActiveTab()` in `popup.js` queries `chrome.tabs.query({ active: true, currentWindow: true })`, and `classifyUrl()` maps the URL to one of four categories: `collection` (`/games/{gameDomain}/collections/{slug}(/revisions/{n})`), `mod` (`/{game}/mods/{id}`), `nexus` (other nexusmods.com pages), or `not-nexus`.

That classification drives everything the rows can do. The popup never requests `<all_urls>` or `tabs`; `activeTab` is the minimal capability that supports "tell me where I am, and act on the current tab."

## The rows

### `#site-row` — "Current site"

Label shows the classification (Collection page / Mod page / On Nexus Mods / Not on Nexus). Clicking focuses the Nexus tab (`chrome.tabs.update(activeTab.id, { active: true })`) if the current tab is a Nexus page, or opens `https://www.nexusmods.com/` otherwise. It is the "get me to Nexus" affordance — the popup closes after (`window.close()`), because the popup's job is to start the user on their way, not to hover.

### `#collection-row` — "Collection Downloader"

The value text is On/Off, derived from `enabled && handleCollections`. Clicking on a collection tab does something the other rows can't: it sends `NXDT_FOCUS_COLLECTION_PANEL` via `chrome.tabs.sendMessage(activeTab.id, ...)` — **directly to the content script in that tab**. This message deliberately never touches the service worker. It is not registered in `message-router.js`; there is no `NXDT_FOCUS_COLLECTION_PANEL` handler in the worker. The reason is that the request is page-local: the content script's listener (`src/content/nexus-content.js`) finds `[data-nxdt-collection]`, scrolls it into view (`scrollIntoView({ behavior: 'smooth', block: 'center' })`), adds the `nxdt-panel-focus` class for 1600 ms, and answers `{ ok: true }`. Routing that through the worker would add a round trip and, worse, would wake the worker for a UI nicety that has nothing to do with it.

The response closes the popup on `{ ok: true }`; otherwise the popup focuses the tab instead, so the user lands on the page where the panel should be (page not loaded, panel not yet mounted, or the content script not present). The callback reads `chrome.runtime.lastError` explicitly — that keeps the runtime quiet when no content script is listening, and it is how the popup distinguishes "no listener" from "listener said no." On a non-collection tab the row creates `https://www.nexusmods.com/collections/` instead.

### `#nowait-row` — "Countdown Skip"

Value text derives from `enabled && autoStartDownload`. Clicking toggles `autoStartDownload` in storage — and the toggle is a **read-merge-write**, not a blind write:

```js
const raw = await chrome.storage.local.get(STORAGE_KEY_SETTINGS);
stored = raw[STORAGE_KEY_SETTINGS] || {};
const next = { ...stored, autoStartDownload: !base };
await chrome.storage.local.set({ [STORAGE_KEY_SETTINGS]: next });
```

The spread-then-flip guarantees the other settings keys survive the toggle. A blind `set({ settings: { autoStartDownload: false } })` would clobber `collectionDownloadSpeed`, `handleCollections`, and the rest — a class of bug that is easy to ship because it only shows up when a user changes more than one setting. The content script re-applies no-wait features via `chrome.storage.onChanged`, so the toggle takes effect on live pages without a reload, and the popup re-renders its labels from the same event plus the worker's `NXDT_SETTINGS_CHANGED` broadcast.

### `#open-settings` — "Settings"

`chrome.runtime.openOptionsPage()` opens the options page (`options_ui` with `open_in_tab: true`). This is the only row that leaves the popup context entirely; everything tunable about the extension lives there, not in the popup, keeping the popup deliberately small.

## Why rows are actions, not status text

A popup full of status readouts would be honest but useless — the user cannot *do* anything with "On" or "Off". Each row's label is a capability and its value text is a hint about current state. That combination is also a deliberate failure-mode decision, learned the hard way.

A past build shipped a popup whose script never loaded: an HTML asset path bug referenced the bundle at a doubled directory (`popup/popup.js` resolved against the popup's own directory to a nonexistent target), so the page rendered as static, inert text — "On"/"Off" labels with nothing behind them. The lesson, encoded in two places:

- **The html-assets test** (`tests/html-assets.test.js`) parses every `src/**/*.html`, resolves each `src`/`href` relative to the page's own directory, and fails if the target doesn't exist. The comment in the test calls out the doubled-path bug class by name; running `npm run test` after touching any HTML page is the project's verification rule (see `AGENTS.md`).
- **The popup's design** assumes partial failure is possible: every `chrome.*` call is guarded (`typeof chrome !== 'undefined'`, `chrome.runtime?.sendMessage`, `chrome.tabs?.query`, ...). If the extension APIs are missing or the popup is embedded somewhere unusual, it renders its labels, shows "Not on Nexus", and clicks do nothing — it degrades visibly instead of throwing. This is also what lets the popup tests run under happy-dom with a partial chrome mock: `refresh()` is exported for tests and re-invoked on `chrome.storage.onChanged` and `NXDT_SETTINGS_CHANGED`.

In other words: the popup is built on the assumption that it can break, and the failure mode is "an inert but readable card," never "a crash" and never "silently wrong state."

## The status dot and stats

`#status-dot` is green when the service worker answers `NXDT_PING` with `alive: true` and the extension is enabled, gray (`.inactive`) otherwise. `#collections-count` shows `stats.collectionsDownloaded` from the same ping. These are the only read-only elements, and they exist to answer the one question a user has before acting: *is this thing actually running?* — if the dot is gray, the rows' "On" labels are aspirational, and the user should look at the worker, not the popup.

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
- [Cloudflare and rate limits](./cloudflare-and-rate-limits.md)
