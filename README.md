<div align="center">

<img src="assets/icon-128.png" width="96" height="96" alt="Nexus Mods Download Tools Logo">

# Nexus Mods Download Tools

**High-performance Manifest V3 browser extension for one-click mod downloads, local load order synchronization, background queue management, and automated requirement bundling.**

[![Version](https://img.shields.io/badge/version-0.1.2-2d3238?style=flat-square)](https://github.com/Zendevve/nexus-mods-downloader)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-1a1c1f?style=flat-square)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Chromium](https://img.shields.io/badge/Chromium-Extension-4285f4?style=flat-square)](https://www.google.com/chrome/)
[![Firefox](https://img.shields.io/badge/Firefox-AMO%20Ready-ff7139?style=flat-square)](https://addons.mozilla.org/)
[![Tests](https://img.shields.io/badge/tests-vitest%20passing-brightgreen?style=flat-square)](https://vitest.dev/)
[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-Donate-FFDD00?style=flat-square&logo=buy-me-a-coffee&logoColor=000000)](https://buymeacoffee.com/zendevve)

[Overview](#overview) • [Key Features](#key-features) • [Architecture](#architecture) • [Installation](#installation) • [Presets](#tuning-presets) • [Permissions](#permissions) • [Development](#development) • [Documentation](#documentation) • [Support](#support--donations)

</div>

---

## Overview

**Nexus Mods Download Tools** is an open-source Manifest V3 extension for Chromium-based browsers (Chrome, Edge, Brave, Opera, Vivaldi) and Mozilla Firefox. It connects your web browser directly to your modding workflow by syncing your local Mod Organizer 2 and Vortex load orders, displaying live in-browser installed badges, crawling recursive dependency trees, analyzing pre-download mod health, restoring download controls on archived files, and routing batch downloads through a resilient background service worker.

> [!NOTE]
> The extension stores no user credentials or passwords. Downloads are authenticated using your existing Nexus Mods browser session. Cloudflare verification challenges are respected and never bypassed—the extension safely yields to standard browser navigation when manual interaction is required.

---

## Key Features

- **Local Load Order & Mod Inventory Sync**: Import your Mod Organizer 2 `modlist.txt` / `plugins.txt` or Vortex export JSON. The extension indexes your installed mods and dynamically injects live status badges (`[Installed v1.2]`, `[Update Available]`, `[Not Installed]`) across mod page headers, search results, and category listings.
- **Deep Recursive Dependency Resolver**: Crawls nested mod requirements up to 3 levels deep. Renders an interactive tree view with depth indicators (`L1 Primary`, `L2 Sub-Dependency`) and automatically enqueues downloads in reverse topological dependency order (frameworks first, dependent mods second).
- **Pre-Download Compatibility & Health Radar**: Embedded directly into mod pages, this radar parses game runtime targets (e.g. `1.6.1170`), open bug reports, and endorsement ratios to provide an instant health score and compatibility verdict before downloading.
- **Native NexusMods Design System**: Built with an authentic NexusMods aesthetic using the `Montserrat` typography stack, signature Nexus amber palette (`#da8e35`), crisp 4px radiuses, and pure SVG iconography (100% emoji-free).
- **Persistent Background Queue**: Offloads batch downloads and collection runs to a background service worker that continues processing even when browser tabs are closed or navigated away.
- **In-Page Floating HUD Drawer**: Slide-out tray provides real-time progress indicators, transfer speeds, active concurrency slots, and pause/resume/retry controls directly within any Nexus Mods page.
- **Inline Archive Inspector**: Preview zip/7z/rar archive folder structures, FOMOD layouts, and target directories inline on file listings without downloading multi-gigabyte archives.
- **Search & Browse Card Actions**: Injects 1-click `NXM` and `Queue` buttons directly onto mod cards in search results, category listings, and explore feeds.
- **Archived File Restorer**: Replaces disabled download triggers on archived and hidden mod files with operational `Mod Manager Download` and `Manual Download` buttons.
- **Countdown Skip (No-Wait)**: Bypasses the 5-second countdown timer, auto-triggers downloads, skips requirement confirmation dialogues, and optionally auto-closes intermediary tabs.
- **Automated Directory Sorting & MO2 Metadata**: Automatically sorts browser downloads into organized `Downloads/NexusMods/[Game]/[ModName]` directories and writes accompanying Mod Organizer 2 `.meta` files.
- **Adaptive Concurrency & Backoff**: Supports 1 to 5 parallel downloads with automated exponential backoff retry on HTTP 429 rate limits or transient network failures.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Nexus Mods Web Pages                    │
│  ┌───────────────────────┐       ┌───────────────────────┐  │
│  │ Content Scripts       │       │ In-Page HUD Drawer    │  │
│  │ • Inventory Annotator │       │ • Real-Time Progress  │  │
│  │ • Health Radar        │       │ • Queue Controls      │  │
│  │ • Dependency Bundler  │       │ • Error Inspector     │  │
│  │ • Archive Inspector   │       │                       │  │
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
│  │ • Local Mod Inventory & State Storage (chrome.storage)│  │
│  └───────────┬───────────────────────────────┬───────────┘  │
│              │                               │              │
│              ▼                               ▼              │
│  ┌───────────────────────┐       ┌───────────────────────┐  │
│  │ Nexus Resolver API    │       │ Browser Downloads API │  │
│  │ • GraphQL Client      │       │ • Folder Organization │  │
│  │ • Dependency Crawler  │       │ • MO2 .meta Creation  │  │
│  │ • Token / CDN Routing │       │                       │  │
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

#### Chromium (Chrome, Edge, Brave, Opera, Vivaldi)
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
| **Free-Tier Safe** | Free accounts & tight limits | Serial execution (1 worker), 3-second spacing between requests to prevent 429 errors. |
| **MO2 Power User** | Mod Organizer 2 users | Direct NXM protocol dispatch, MO2 `.meta` generation, custom folder nesting. |

---

## Permissions

The extension requests only permissions necessary to automate downloads, maintain inventory sync, and manage background queues:

| Permission | Purpose |
| :--- | :--- |
| `storage` | Persists user preferences, presets, mod inventory indices, queue state, and collection history. |
| `downloads` | Initiates browser-managed downloads and routes destination subfolder paths. |
| `activeTab` | Inspects the current page URL and injects user-requested modal overlays and status badges. |
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

# Run complete quality pipeline (lint + test + package)
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

---

## Support & Donations

If **Nexus Mods Download Tools** has saved you time or made your modding workflow smoother, please consider supporting the project!

Maintaining an extension that interfaces directly with third-party web platforms requires continuous effort. Your donations directly help:
- **Maintain Compatibility**: Keeping up with Nexus Mods site updates, API changes, and Cloudflare adjustments.
- **Test Infrastructure**: Supporting automated cross-browser test suites and CI coverage across Chromium and Firefox.
- **Rapid Feature Development**: Building requested community features like improved collection queueing, smarter dependency resolvers, and deeper Mod Organizer 2 integrations.

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-Donate-FFDD00?style=flat-square&logo=buy-me-a-coffee&logoColor=000000)](https://buymeacoffee.com/zendevve)

**Support development on Buy Me a Coffee**: [https://buymeacoffee.com/zendevve](https://buymeacoffee.com/zendevve)
