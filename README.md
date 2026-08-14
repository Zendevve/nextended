# Nexus Mods Download Tools

A Chromium Manifest V3 browser extension that restores usable download controls for
**archived Nexus Mods files** — without requiring Tampermonkey/Greasemonkey.

When you visit a Nexus Mods page with an archived file listing, the extension injects
**Mod Manager Download** and **Manual Download** buttons for each archived file, and
resolves downloads through the user's existing Nexus session. It also adds a collection
downloader panel, a 5-second-countdown bypass, requirements-warning skip, and
auto-close options.

- **No credentials** are requested, stored, or transmitted.
- **No backend** — all work happens in the browser extension.
- **No Cloudflare/DRM bypassing** — Cloudflare challenges are detected and the
  extension falls back to normal browser navigation.
- Permissions are narrowly scoped to Nexus domains.
- **Every resolved download URL is allow-list validated** and every message sender
  is verified before any privileged action.

## Install (development / unpacked)

1. Build the extension:

   ```bash
   npm install
   npm run build
   ```

2. Open `chrome://extensions` (or `edge://extensions`).
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the `dist/chrome` folder.

## Usage

- Visit `https://www.nexusmods.com/{game}/mods/{mod}?tab=files&category=archived`.
- Each archived file gets `Mod Manager Download` and `Manual Download` buttons.
- On a collection page, the **Collection Downloader** panel downloads all or
  mandatory mods, lets you pick specific mods, and shows revision diffs.
- Open the popup (extension icon) for live status and quick actions: it shows
  the current tab's page, jumps to the collection downloader panel, toggles
  Countdown Skip, and opens **Settings** (all 13 settings, including the
  no-wait automation toggles and collection downloader options).

## Development

```bash
npm install          # install dev dependencies
npm run build        # bundle to dist/chrome (minified)
npm run dev          # watch + rebuild + re-copy statics on change
npm run test         # run unit tests
npm run lint         # lint src, scripts, tests
npm run check        # lint + test + build
npm run format       # format with Prettier
```

## Documentation

The docs are organized by Diátaxis purpose, all written for developers:

- [Tutorial — Getting started](docs/tutorial/getting-started.md): build, load, and trace a download end-to-end.
- [How-to guides](docs/how-to/add-a-setting.md): add a setting, add a message type, debug and verify, distribute.
- [Reference](docs/reference/architecture.md): architecture, message protocol, settings, errors, permissions, security model.
- [Explanation](docs/explanation/why-the-service-worker-owns-everything.md): why the service worker owns privileged operations, how the download queue works, Cloudflare and rate limits, the popup UX flow.

## Architecture

```
Content script          Service worker          Nexus
(in page / DOM)  ←message→  (privileged)  ↔  www.nexusmods.com / api-router.nexusmods.com
```

- `src/content/` — page detection, DOM inspection, button injection, MutationObserver.
- `src/background/` — sender validation, message routing, download resolution, stats.
- `src/nexus/` — GraphQL client, download URL validation (allow-list).
- `src/storage/` — `chrome.storage`-based settings + statistics.
- `src/popup/` and `src/options/` — UI.
- `src/shared/` — constants, message factory, structured logger, typed errors.

**Content scripts manipulate Nexus pages; they never perform privileged network operations.**
**The service worker owns privileged requests, sender validation, and URL validation.**

### Download resolution

1. Content script extracts `fileId` (and `gameId`/`slug`/`modId` where relevant)
   and the user's chosen `mode`.
2. Sends `RESOLVE_ARCHIVED_DOWNLOAD` (archived files) or
   `RESOLVE_COLLECTION_DOWNLOAD` (collection downloads) to the service worker.
3. Worker calls the Nexus endpoint
   (`.../Core/Downloads/GenerateDownloadUrl?file_id=...` or the
   `Core/Libs/Common/Managers/Downloads` POST endpoint) with a timeout.
4. Response is classified: CDN URL, NXM manager link, Cloudflare challenge,
   auth error, or file-not-found.
5. The final URL is validated against an allow-list of Nexus/Nexus-CDN hosts
   before the browser starts the download or follows the manager link.

See the [Reference — architecture](docs/reference/architecture.md) and
[Explanation — service worker](docs/explanation/why-the-service-worker-owns-everything.md)
for the full write-up.

## Permissions

| Permission                        | Why                                        |
| --------------------------------- | ------------------------------------------ |
| `storage`                         | Persist settings & stats.                  |
| `downloads`                       | Start browser-managed downloads.           |
| `https://*.nexusmods.com/*`       | Resolve download URLs via your session (covers `www.nexusmods.com` and `api-router.nexusmods.com`). |
| `https://*.nexus-cdn.com/*`       | Allow-listed CDN destinations for downloads. |

`<all_urls>`, `tabs`, `cookies`, `webRequestBlocking`, and `nativeMessaging` are **not** requested.

## License

Proprietary — Nexus Mods Download Tools contributors. See [LICENSE](./LICENSE) for the
limited personal-use terms under which installation is permitted.
