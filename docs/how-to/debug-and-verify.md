# Debug and Verify

Verification ladder for this extension: service-worker logs, a live popup check, a real-extension browser smoke, and a fixture smoke with a stubbed `window.chrome`. Work up the ladder — the last two catch what unit tests cannot: bundle 404s, missing statics, and page-script failures.

## Service worker logging

All logging goes through `createLogger(namespace)` from `src/shared/logger.js`, which prefixes every line with `LOG_PREFIX` (`[NXDT]`) plus the namespace — e.g. `createLogger('handlers')` emits `[NXDT] handlers`. Levels: `DEBUG` (10), `INFO` (20), `WARN` (30), `ERROR` (40); `error` lines go to `console.error`, `warn` to `console.warn`, the rest to `console.log`. Context objects are JSON-stringified onto the line.

The level is driven by the `debugLogging` setting:

- `src/background/service-worker.js` `init()` calls `refreshClients()`, which runs `log.setLevel(settings.debugLogging ? LOG_LEVELS.DEBUG : LOG_LEVELS.INFO)` — so `debugLogging: true` surfaces every `log.debug(...)` line, including the router's per-message traces (`Handled message`, `No handler for message`).
- The `NXDT_SETTINGS_CHANGED` handler re-runs `refreshClients()`, so toggling `debugLogging` in the options page applies immediately, no reload.

To inspect: open `chrome://extensions`, enable Developer mode, find "Nexus Mods Download Tools", and click the **service worker** link — a DevTools window for the worker opens. Filter the console by `[NXDT]`. The service worker is ephemeral; it spins down after idleness, so logs from a message that started it appear fresh each time.

## Popup live check

Open the popup (action button, or Ctrl+Shift+Y). A working popup populates its rows from two service-worker messages — `NXDT_PING` (stats, aliveness) and `NXDT_GET_SETTINGS` (row states):

- `#site-name` — the active tab's classification (`—` until rendered)
- `#collection-state` / `#nowait-state` — On/Off
- `#collections-count` — `0` until PING returns

If the rows stay at their static defaults (`—`, `—`, `—`, `0`), the page script did not run — almost always because `popup/popup.js` failed to load. That is the bug class the html-assets rule exists for:

- **Run `npm run test` after touching any `src/**/*.html`.** `tests/html-assets.test.js` parses every page and resolves each `src`/`href` against the page's own directory; it fails on references that point outside the page (the doubled-path bug that once shipped a dead popup).
- **Never verify a page by inlining its bundle into a fixture.** Inlining masks the 404: the code runs, the page looks fine, and the missing file is never requested. happy-dom fetches no scripts, so a green happy-dom suite does not prove the page loads.

If the page loads but `popup.js` errors, open the popup, right-click → Inspect, and read the console — or use the real-extension smoke below, which observes the same console from the driver.

## Real-extension smoke

Verified flow this session: launch a Playwright Chromium with the built extension loaded, discover its ID from CDP targets, and drive the extension pages while watching for failed requests.

```bash
npm run build
```

Then, with Playwright (the verified binary: `C:\Users\natha\AppData\Local\ms-playwright\chromium-1228\chrome-win64\chrome.exe`):

```js
const { chromium } = require('playwright');
const path = 'C:/Users/natha/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
const userDataDir = `${process.cwd()}/.smoke-profile`; // fresh profile, delete between runs

const context = await chromium.launchPersistentContext(userDataDir, {
  executablePath: path,
  headless: true,
  args: [
    `--load-extension=${process.cwd()}/dist/chrome`,
    `--disable-extensions-except=${process.cwd()}/dist/chrome`,
    '--no-first-run',
    '--no-default-browser-check',
  ],
});

// Discover the extension ID from its service worker target URL.
let sw = context.serviceWorkers()[0];
if (!sw) sw = await context.waitForEvent('serviceworker');
const id = new URL(sw.url()).host; // chrome-extension://<id>/...
const base = `chrome-extension://${id}`;

const page = await context.newPage();
const failed = [];
page.on('requestfailed', (r) => failed.push(`FAIL ${r.url()} :: ${r.failure()?.errorText}`));
page.on('response', (r) => { if (r.status() >= 400) failed.push(`HTTP ${r.status()} ${r.url()}`); });

await page.goto(`${base}/popup/popup.html`);
await page.goto(`${base}/options/options.html`);
// Optionally screenshot both pages.
console.log(failed.length ? failed : 'no failed requests');
await context.close();
```

`launchPersistentContext` takes the user-data dir as its first argument, so a fresh profile is a fresh directory — delete `.smoke-profile` (or use a unique dir) between runs; a dirty profile can hold a stale install with a different ID. Assert: zero `requestfailed` events, no HTTP ≥ 400 responses, and (by screenshot or DOM query) the popup rows and options inputs are populated.

## Fixture smoke with stubbed `window.chrome`

Use this when the goal is UI behavior on a Nexus page without a live extension: serve a fake collection page at a `nexusmods.com` URL via request interception, stub `window.chrome` (storage, runtime messaging) via `page.addInitScript`/`evaluateOnNewDocument`, then exercise the panel and queue. This is how the collection panel and queue run were verified this session.

When to use it: iterating on `collection-ui.js` / `no-wait.js` behavior, screenshots of panel states, queue-run assertions — anything that needs a full DOM on a real page origin but not the service worker.

Its blind spot: **script loading is bypassed when bundles are inlined** into the fixture, and the stubbed `chrome` means nothing requests the real `dist/chrome` files. A missing bundle, a 404, or a dead HTML reference will not surface here. That is exactly what the real-extension smoke detects — so run it (or at least `npm run test` for the html-assets check) before declaring a page change done.

## See also

- [Getting started](../tutorial/getting-started.md)
- [Add a setting](../how-to/add-a-setting.md)
- [Add a message type](../how-to/add-a-message-type.md)
- [Distribute](../how-to/distribute.md)
- [Architecture](../reference/architecture.md)
- [Message protocol](../reference/message-protocol.md)
- [Settings and storage](../reference/settings-and-storage.md)
- [Errors](../reference/errors.md)
- [Permissions](../reference/permissions.md)
- [Security model](../reference/security-model.md)
- [Why the service worker owns everything](../explanation/why-the-service-worker-owns-everything.md)
- [How the download queue works](../explanation/how-the-download-queue-works.md)
- [Cloudflare and rate limits](../explanation/cloudflare-and-rate-limits.md)
- [The popup UX flow](../explanation/the-popup-ux-flow.md)
