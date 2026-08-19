<div align="center">

<img src="assets/icon-128.png" width="96" height="96" alt="Nexus Mods Download Tools Logo">

# Nexus Mods Download Tools

**High-performance Manifest V3 browser extension for one-click mod downloads, background queue management, and automated requirement bundling.**

[![Version](https://img.shields.io/badge/version-0.1.0-2d3238?style=flat-square)](https://github.com/Zendevve/nexus-mods-downloader)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-1a1c1f?style=flat-square)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Chromium](https://img.shields.io/badge/Chromium-Extension-4285f4?style=flat-square)](https://www.google.com/chrome/)
[![Firefox](https://img.shields.io/badge/Firefox-AMO%20Ready-ff7139?style=flat-square)](https://addons.mozilla.org/)
[![Tests](https://img.shields.io/badge/tests-vitest%20passing-brightgreen?style=flat-square)](https://vitest.dev/)

[Overview](#overview) • [Features](#key-features) • [Installation](#installation) • [Presets](#tuning-presets) • [Permissions](#permissions) • [Development](#development) • [Documentation](#documentation)

</div>

---

## Overview

**Nexus Mods Download Tools** is an open-source Manifest V3 extension for Chromium-based browsers (Chrome, Edge, Brave, Opera) and Mozilla Firefox. It streamlines the modding workflow by restoring download controls on archived mod pages, eliminating manual countdown delays, queueing full collections in the background, bundling prerequisite dependencies in one click, and automatically sorting downloaded files with Mod Organizer 2 metadata support.

> [!NOTE]
> The extension stores no user credentials or passwords. Downloads are authenticated using your existing Nexus Mods browser session. Cloudflare verification challenges are respected and never bypassed—the extension safely yields to standard browser navigation when manual interaction is required.

---

## Key Features

- **Persistent Background Queue**: Offloads batch downloads and collection runs to a background service worker that continues processing even when browser tabs are closed or navigated away.
- **In-Page Floating HUD Drawer**: Slide-out tray provides real-time progress indicators, transfer speeds, active concurrency slots, and pause/resume/retry controls directly within any Nexus Mods page.
- **Smart Requirements Bundler**: Inspects dependency trees with a single click to present a "Download Mod + All Requirements" modal, allowing direct batch queueing of prerequisites.
- **Search & Browse Card Actions**: Injects 1-click `Main File (NXM)` and `Queue` actions directly onto mod cards in search results, category listings, and explore feeds.
- **Archived File Restorer**: Replaces disabled download triggers on archived and hidden mod files with fully operational `Mod Manager Download` and `Manual Download` buttons.
- **Countdown Skip (No-Wait)**: Bypasses the slow-download countdown page, auto-triggers downloads, skips requirement confirmation dialogues, and optionally auto-closes intermediary tabs.
- **Automated Directory Sorting & MO2 Metadata**: Automatically sorts browser downloads into organized `Downloads/NexusMods/[Game]/[ModName]` directories and writes accompanying Mod Organizer 2 `.meta` files.
- **Adaptive Concurrency & Backoff**: Supports 1 to 5 parallel downloads with automated exponential backoff retry on HTTP 429 rate limits or transient network failures.
- **Dual-Target Cross-Browser Build**: Built from a unified codebase targeting both Chromium and Firefox Manifest V3 specifications.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Nexus Mods Web Pages                    │
│  ┌───────────────────────┐       ┌───────────────────────┐  │
│  │ Content Scripts       │       │ In-Page HUD Drawer    │  │
│  │ • Archive Inspector   │       │ • Real-Time Progress  │  │
│  │ • No-Wait Automation  │       │ • Queue Controls      │  │
│  │ • Requirement Bundler │       │ • Error Inspector     │  │
│  │ • Card Quick Actions  │       │                       │  │
│  └───────────┬───────────┘       └───────────┬───────────┘  │
└──────────────┼───────────────────────────────┼──────────────┘
               │  chrome.runtime.sendMessage   │
               ▼                               ▼
┌─────────────────────────────────────────────────────────────┐
│             Background Service Worker Engine                │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Message Router & Security Boundary (Allow-List Guard) │  │
│  └───────────────────────────┬───────────────────────────┘  │
│                              ▼                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Queue Manager & Concurrency Controller (1-5 Workers)  │  │
│  │ • Exponential Backoff & Retry Logic                   │  │
│  │ • State Synchronization (IndexedDB / chrome.storage)  │  │
│  └───────────┬───────────────────────────────┬───────────┘  │
│              │                               │              │
│              ▼                               ▼              │
│  ┌───────────────────────┐       ┌───────────────────────┐  │
│  │ Nexus Resolver API    │       │ Browser Downloads API │  │
│  │ • GraphQL Client      │       │ • Folder Organization │  │
│  │ • Token / CDN Routing │       │ • MO2 .meta Creation  │  │
│  └───────────────────────┘       └───────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) version 18.18 or higher
- `npm` version 9.0 or higher

### Build from Source

```bash
# Clone the repository
git clone https://github.com/Zendevve/nexus-mods-downloader.git
cd nexus-mods-downloader

# Install dependencies
npm install

# Build extension bundles for Chromium and Firefox
npm run build
```

The build artifacts will be generated in `dist/chrome` and `dist/firefox`.

---

### Loading the Extension

#### Chromium (Chrome, Edge, Brave, Opera)
1. Navigate to `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode** via the toggle switch in the top right corner.
3. Click **Load unpacked**.
4. Select the `dist/chrome` directory from your project folder.

#### Mozilla Firefox
1. Navigate to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**
3. Select the `dist/firefox/manifest.json` file.

> [!TIP]
> Use the shortcut <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Y</kbd> (or <kbd>Cmd</kbd> + <kbd>Shift</kbd> + <kbd>Y</kbd> on macOS) to open the extension popup from any active tab.

---

## Tuning Presets

The extension includes four pre-configured profiles accessible from the Settings page:

| Preset Profile | Target Audience | Concurrency & Behavior |
| :--- | :--- | :--- |
| **Solo Modder** | Individual mod browsing | Instant zero-delay triggers, auto-close download tabs, skip interstitial alerts. |
| **Collection Hoarder** | Heavy collection installs | Persistent background queue, 4 parallel download slots, aggressive auto-retry. |
| **Cautious Free-Tier** | Free accounts & tight limits | Serial execution (1 worker), 3-second spacing between requests to prevent 429 errors. |
| **MO2 Power User** | Mod Organizer 2 users | Direct NXM protocol dispatch, MO2 `.meta` generation, custom folder nesting. |

---

## Permissions

The extension requests only permissions necessary to automate downloads and maintain background queue state:

| Permission | Purpose |
| :--- | :--- |
| `storage` | Persists user preferences, presets, download queue state, and collection history. |
| `downloads` | Initiates browser-managed downloads and routes destination subfolder paths. |
| `activeTab` | Inspects the current page URL and injects user-requested modal overlays. |
| `notifications` | Alerts the user when long-running collection queues complete or encounter blockers. |
| `https://*.nexusmods.com/*` | Resolves download tokens and queries the Nexus Mods GraphQL API. |
| `https://*.nexus-cdn.com/*` | Allow-listed destination CDN hosts for safe direct file downloads. |

---

## Development

```bash
# Start live build watcher for Chromium
npm run dev:chrome

# Start live build watcher for Firefox
npm run dev:firefox

# Run unit and integration tests with Vitest
npm test

# Run ESLint validation
npm run lint

# Format code with Prettier
npm run format

# Run complete quality pipeline (lint + test + build)
npm run check
```

---

## Documentation

Comprehensive guides and developer references are available across the repository and [`docs/`](docs/):

- **[User Installation Guide (INSTALLATION.md)](INSTALLATION.md)**
- **[Browser Installation & Update Guide](docs/how-to/installation-guide.md)**
- **[Packaging & Distribution Guide](docs/how-to/distribute.md)**
- [Architecture Overview](docs/reference/architecture.md)
- [Message Protocol Specification](docs/reference/message-protocol.md)
- [Security Model & Allow-List Policy](docs/reference/security-model.md)
- [Settings and Storage Schema](docs/reference/settings-and-storage.md)
- [Download Queue & Concurrency Engine](docs/explanation/how-the-download-queue-works.md)
- [Cloudflare & Rate-Limiting Strategy](docs/explanation/cloudflare-and-rate-limits.md)
- [Error Taxonomy & Handling](docs/reference/errors.md)
