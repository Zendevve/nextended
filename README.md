<div align="center">

<img src="assets/icon-128.png" width="96" alt="Nexus Mods Download Tools icon">

# Nexus Mods Download Tools

**Restore usable download controls for archived Nexus Mods files — no userscript manager required.**

[![Version](https://img.shields.io/badge/version-0.1.0-2d3238?style=flat-square)](https://github.com/Zendevve/nexus-mods-downloader)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-1a1c1f?style=flat-square)
![Chromium](https://img.shields.io/badge/Chromium-Extension-4285f4?style=flat-square)

[Features](#features) • [Installation](#installation) • [Usage](#usage) • [Documentation](#documentation) • [Development](#development)

</div>

A Manifest V3 browser extension that brings back fast, one-click downloads for archived Nexus Mods files. It injects **Mod Manager Download** and **Manual Download** buttons into archived file listings, adds a full **collection downloader** panel with a serial queue, and automates the slow-download countdown — all through your existing Nexus session.

> [!NOTE]
> The extension stores no credentials. Downloads are resolved through your own Nexus session cookies, and Cloudflare challenges are detected and **never** bypassed — the extension falls back to normal browser navigation instead.

## Features

- **Archived-file buttons** — `Mod Manager Download` and `Manual Download` for every archived file, without Tampermonkey or Greasemonkey.
- **Collection downloader** — download all, mandatory-only, or a hand-picked selection; diff collection revisions; previously downloaded files are auto-skipped; a live progress bar and activity log track the serial queue.
- **Countdown Skip** — bypass the slow-download countdown, auto-start downloads, skip requirements warnings, and optionally auto-close the tab.
- **Actionable popup** — see which page you're on, jump straight to the collection panel, toggle Countdown Skip, and check live stats.
- **Security first** — every download URL is allow-list validated and every message sender is verified; no credentials are requested or stored.

## Installation

Requires [Node.js 18.18+](https://nodejs.org) and a Chromium-based browser (Chrome or Edge).

```bash
git clone https://github.com/Zendevve/nexus-mods-downloader.git
cd nexus-mods-downloader
npm install
npm run build
```

Then load the built extension:

1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked** and select the `dist/chrome` folder.

> [!TIP]
> Press `Ctrl+Shift+Y` (macOS: `Cmd+Shift+Y`) to open the popup from anywhere.

> [!IMPORTANT]
> After a rebuild, click the reload icon on the extension card and refresh any open Nexus page — the extension does not pick up file changes automatically.

## Usage

**Archived files** — visit `https://www.nexusmods.com/{game}/mods/{mod}?tab=files&category=archived`: each file gets Mod Manager and Manual download buttons.

**Collections** — open a collection page (`/games/{game}/collections/{slug}`): the downloader panel offers segmented delivery (Vortex/MO2 or browser-direct), a Download All hero button with mod count, Mandatory-only, Select Mods, and Update Diff. The queue runs serially with configurable pacing and can be paused, skipped, or stopped at any time.

**Popup** — the toolbar popup shows your current page, jumps to the collection panel, toggles Countdown Skip, and opens **Settings** (all 13 settings).

## Documentation

The full documentation set is organized by Diátaxis purpose, written for developers:

- [Tutorial — Getting started](docs/tutorial/getting-started.md): build, load, and trace a download end-to-end.
- [How-to guides](docs/how-to/add-a-setting.md): add a setting, add a message type, debug and verify, distribute.
- [Reference](docs/reference/architecture.md): architecture, message protocol, settings, errors, permissions, security model.
- [Explanation](docs/explanation/why-the-service-worker-owns-everything.md): why the service worker owns privileged operations, how the download queue works, Cloudflare and rate limits, the popup UX flow.

## Development

```bash
npm install          # install dev dependencies
npm run build        # bundle to dist/chrome (minified)
npm run dev          # watch + rebuild + re-copy statics on change
npm run test         # run unit tests (vitest)
npm run lint         # lint src, scripts, tests
npm run check        # lint + test + build
npm run format       # format with Prettier
```

## Architecture

```
Content script          Service worker          Nexus
(in page / DOM)  ←message→  (privileged)  ↔  www.nexusmods.com / api-router.nexusmods.com
```

- `src/content/` — page detection, DOM injection, collection panel, no-wait automation.
- `src/background/` — sender validation, message routing, download resolution, stats.
- `src/nexus/` — GraphQL client, download URL allow-list.
- `src/storage/` — typed, versioned settings and stats in `chrome.storage.local`.
- `src/popup/`, `src/options/` — UI.
- `src/shared/` — constants, message factory, structured logger, error codes.

Content scripts manipulate Nexus pages but never perform privileged network operations; the service worker owns every privileged request, validates every sender, and validates every URL before it reaches `chrome.downloads`.

## Permissions

| Permission | Why |
|---|---|
| `storage` | Settings, stats, and collection history. |
| `downloads` | Start browser-managed downloads. |
| `activeTab` | Read the active tab's URL while the popup is open. |
| `https://*.nexusmods.com/*` | Resolve download URLs through your session. |
| `https://*.nexus-cdn.com/*` | Allow-listed CDN download destinations. |

`<all_urls>`, `tabs`, `cookies`, `webRequestBlocking`, and `nativeMessaging` are not requested.
