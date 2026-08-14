<div align="center">

<img src="assets/icon-128.png" width="96" alt="Nexus Mods Download Tools icon">

# Nexus Mods Download Tools

**The definitive, all-in-one downloading power suite for Nexus Mods — no userscript manager required.**

[![Version](https://img.shields.io/badge/version-0.1.0-2d3238?style=flat-square)](https://github.com/Zendevve/nexus-mods-downloader)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-1a1c1f?style=flat-square)
![Chromium](https://img.shields.io/badge/Chromium-Extension-4285f4?style=flat-square)
![Firefox](https://img.shields.io/badge/Firefox-AMO%20Ready-ff7139?style=flat-square)

[Features](#features) • [Installation](#installation) • [Usage](#usage) • [Presets](#presets) • [Documentation](#documentation) • [Development](#development)

</div>

A high-performance Manifest V3 browser extension for **Chromium** (Chrome, Edge, Brave, Opera) and **Mozilla Firefox** that delivers instant one-click downloads, persistent background collection queuing, automated requirement bundling, search-card quick downloads, Mod Organizer 2 metadata generation, and intelligent download folder sorting.

> [!NOTE]
> The extension stores no credentials. Downloads are resolved through your own Nexus session cookies, and Cloudflare challenges are detected and **never** bypassed — the extension falls back to normal browser navigation instead.

## Features

- **📦 Persistent Background Queue & Floating Drawer** — Queue entire collections or mod lists to a background Service Worker that continues downloading even if you navigate or close tabs. Monitor real-time speeds, active slots, and manage queue items via a global slide-out HUD.
- **⚡ Adaptive Concurrency & Resilience** — 1 to 5 parallel download slots with automatic exponential backoff retry on HTTP 429 rate limits or network drops.
- **🧩 Smart Requirements Bundler** — One-click "Download Mod + All Requirements" modal parses prerequisite mods and external dependencies for batch enqueueing.
- **🔍 Search & Browse Card Actions** — 1-click `Main File (NXM)` and `⚡ Queue` buttons injected directly into mod cards across search and explore pages.
- **📂 Intelligent File Sorting & MO2 Harmony** — Automatically organizes browser downloads into `Downloads/NexusMods/[Game]/[ModName]` subfolders via `chrome.downloads` routing and generates paired Mod Organizer 2 `.meta` files.
- **📦 Archived-File Buttons** — `Mod Manager Download` and `Manual Download` for every archived file, without Tampermonkey or Greasemonkey.
- **⚡ Countdown Skip (No-Wait++)** — Bypasses the slow-download countdown, auto-starts downloads, skips requirements warnings, and optionally auto-closes tabs.
- **🛠️ 1-Click Quick Configuration Presets** — Switch instantly between *Solo Modder*, *Collection Hoarder*, *Cautious Free-Tier*, and *MO2 Power User* in Settings.
- **🦊 Dual-Target Cross-Browser Architecture** — 100% feature parity across Chromium and Firefox MV3 with automated build targets.

## Installation

Requires [Node.js 18.18+](https://nodejs.org).

```bash
git clone https://github.com/Zendevve/nexus-mods-downloader.git
cd nexus-mods-downloader
npm install
npm run build
```

### Loading in Chromium (Chrome, Edge, Brave):
1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked** and select the `dist/chrome` folder.

### Loading in Firefox:
1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**
3. Select `dist/firefox/manifest.json`.

> [!TIP]
> Press `Ctrl+Shift+Y` (macOS: `Cmd+Shift+Y`) to open the popup from anywhere.

## Presets

- 🚀 **Solo Modder (Speed)**: Instant zero-delay downloads, auto-close download tabs, skip warning prompts.
- 📦 **Collection Hoarder (Bulk)**: Background persistent queue, 4 parallel download slots, resilient auto-retry.
- 🛡️ **Cautious Free-Tier**: Gentle 1-at-a-time serial pacing with 3s delays to avoid triggering rate limits on free accounts.
- 🛠️ **MO2 Power User**: Direct NXM protocol dispatch, MO2 `.meta` file generation, and custom download folder routing.

## Development

```bash
npm install          # install dependencies
npm run build        # build both dist/chrome and dist/firefox
npm run build:chrome # build Chromium target only
npm run build:firefox# build Firefox target only
npm run dev          # watch and rebuild on change
npm run test         # run unit & integration tests (vitest)
npm run lint         # lint source, scripts, and tests (eslint)
npm run check        # lint + test + build (all passing)
```

## Permissions

| Permission | Why |
|---|---|
| `storage` | Settings, presets, queue state, and collection history. |
| `downloads` | Start browser-managed downloads and route filenames. |
| `activeTab` | Read active tab URL and send commands while popup/drawer is active. |
| `notifications` | Notify user when background queue completes or needs attention. |
| `https://*.nexusmods.com/*` | Resolve download URLs through your session. |
| `https://*.nexus-cdn.com/*` | Allow-listed CDN download destinations. |
