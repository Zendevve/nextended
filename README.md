# Nexus Mods Download Tools

A Chromium Manifest V3 browser extension that restores usable download controls for
**archived Nexus Mods files** — without requiring Tampermonkey/Greasemonkey.

When you visit a Nexus Mods page with an archived file listing, the extension injects
**Mod Manager Download** and **Manual Download** buttons for each archived file and resolves
the download through the user's existing Nexus session.

- **No credentials** are requested, stored, or transmitted.
- **No backend** — all work happens in the browser extension.
- **No Cloudflare/DRM bypassing** — the extension falls back to normal browser navigation.
- Permissions are narrowly scoped to Nexus domains.

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
- Click to resolve and start the download through your Nexus session.
- Open the popup (extension icon) for status; click **Settings** for configuration.

## Development

```bash
npm install          # install dev dependencies
npm run build        # bundle to dist/chrome
npm run dev          # watch + rebuild on change (no HTTP server)
npm run test         # run unit tests
npm run lint         # lint src, scripts, tests
npm run format       # format with Prettier
```

## Architecture

```
Content script          Service worker          Nexus
(in page / DOM)  ←message→  (privileged)  ↔  api.nexusmods.com / CDN
```

- `src/content/` — page detection, DOM inspection, button injection, MutationObserver.
- `src/background/` — message routing, download orchestration, state.
- `src/nexus/` — Nexus client (HTTP), download resolver, URL/file/game parsers, requirements detection.
- `src/storage/` — `chrome.storage`-based settings + statistics.
- `src/popup/` and `src/options/` — UI.
- `src/shared/` — constants, message factory, structured logger, typed errors.

**Content scripts manipulate Nexus pages; they never perform privileged network operations.**
**The service worker owns privileged requests and URL validation.**

### Download resolution

1. Content script extracts `fileId`, `gameId`, `gameSlug` and the user's chosen `mode`.
2. Sends `RESOLVE_DOWNLOAD` to the service worker.
3. Worker calls the Nexus endpoint
   `https://www.nexusmods.com/{slug}/Core/Downloads/GenerateDownloadUrl?file_id=...`.
4. Response is classified: CDN URL, NXM manager link, requirements flow, Cloudflare
   challenge, auth error, or file-not-found.
5. The final URL is validated against an allow-list of Nexus/Nexus-CDN hosts before the
   browser starts the download or follows the manager link.

See `ARCHITECTURE.md` for the full write-up.

## Permissions

| Permission                  | Why                                     |
| --------------------------- | --------------------------------------- |
| `storage`                   | Persist settings & stats.               |
| `downloads`                 | Start browser-managed downloads.        |
| `https://*.nexusmods.com/*` | Resolve download URLs via your session. |
| `https://*.nexus-cdn.com/*` | Allow-listed CDN destinations.          |

`<all_urls>`, `tabs`, `cookies`, `webRequestBlocking`, and `nativeMessaging` are **not** requested.

## License

Proprietary — Nexus Mods Download Tools contributors. See [LICENSE](./LICENSE) for the
limited personal-use terms under which installation is permitted.
