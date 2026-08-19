# Installation Guide

This guide walks you through installing and configuring **Nexus Mods Download Tools** on Chromium-based browsers (Google Chrome, Microsoft Edge, Brave, Opera, Vivaldi) and Mozilla Firefox.

---

## Table of Contents

- [Option 1: Install from GitHub Releases (Recommended for Most Users)](#option-1-install-from-github-releases-recommended-for-most-users)
  - [Which File Do I Need?](#which-file-do-i-need)
  - [Installing on Chromium (Chrome, Edge, Brave, Opera, Vivaldi)](#installing-on-chromium-chrome-edge-brave-opera-vivaldi)
  - [Installing on Mozilla Firefox](#installing-on-mozilla-firefox)
- [Option 2: Build and Install from Source Code (For Developers)](#option-2-build-and-install-from-source-code-for-developers)
- [How to Update the Extension](#how-to-update-the-extension)
- [Post-Installation & First Run](#post-installation--first-run)
- [Frequently Asked Questions & Troubleshooting](#frequently-asked-questions--troubleshooting)

---

## Option 1: Install from GitHub Releases (Recommended for Most Users)

GitHub Releases provide pre-built, production-optimized `.zip` archives. You do not need to install Node.js, git, or build tools.

### Which File Do I Need?

Visit the [GitHub Releases Page](https://github.com/Zendevve/nexus-mods-downloader/releases/latest) and download the appropriate zip archive:

| Browser | Release Asset | Format |
| :--- | :--- | :--- |
| **Google Chrome, Microsoft Edge, Brave, Opera, Vivaldi, Arc** | `nexus-download-tools-chrome-vX.X.X.zip` | ZIP Archive |
| **Mozilla Firefox, LibreWolf, Waterfox, Floorp** | `nexus-download-tools-firefox-vX.X.X.zip` | ZIP Archive |

---

### Installing on Chromium (Chrome, Edge, Brave, Opera, Vivaldi)

Follow these steps to load the extension into any Chromium-based browser:

#### Step 1: Extract the Zip Archive
1. Download `nexus-download-tools-chrome-vX.X.X.zip`.
2. Extract (unzip) the file into a permanent folder on your computer (e.g., `Documents/Browser-Extensions/nexus-download-tools` or `C:\Extensions\nexus-download-tools`).
   > ⚠️ **Important:** Do not delete or move this folder after installing, as the browser loads files directly from this directory.

#### Step 2: Open Extensions Management
Open your browser and navigate to the extensions page:
- **Google Chrome:** `chrome://extensions`
- **Microsoft Edge:** `edge://extensions`
- **Brave:** `brave://extensions`
- **Opera / Opera GX:** `opera://extensions`
- **Vivaldi:** `vivaldi://extensions`

#### Step 3: Enable Developer Mode
Look in the top-right corner of the Extensions page and switch the **Developer mode** toggle to **ON**.

```
┌──────────────────────────────────────────────────────────────┐
│ Extensions                                  [Developer mode ●]│
│                                                              │
│ [ Load unpacked ]  [ Pack extension ]  [ Update ]            │
└──────────────────────────────────────────────────────────────┘
```

#### Step 4: Load the Unpacked Extension
1. Click the **Load unpacked** button in the top-left toolbar.
2. In the folder picker dialog, select the folder where you extracted the zip archive (the folder containing `manifest.json`).
3. The **Nexus Mods Download Tools** card will immediately appear in your extensions list.

#### Step 5: Pin the Toolbar Icon
1. Click the **Puzzle icon** (Extensions menu) in your browser toolbar.
2. Find **Nexus Mods Download Tools** and click the **Pin icon** (📌) to keep it visible on your toolbar.
3. You can now press <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Y</kbd> (or <kbd>Cmd</kbd> + <kbd>Shift</kbd> + <kbd>Y</kbd> on macOS) to open the extension popup anytime.

---

### Installing on Mozilla Firefox

#### Method A: Temporary Installation (Standard Firefox)
Standard Firefox releases require extensions loaded locally to be loaded as temporary add-ons (active until browser restart):
1. Download and extract `nexus-download-tools-firefox-vX.X.X.zip`.
2. In Firefox's address bar, navigate to `about:debugging#/runtime/this-firefox`.
3. Click the **Load Temporary Add-on...** button.
4. Browse to the extracted folder and select the `manifest.json` file.
5. The extension is now active.

#### Method B: Persistent Installation (Firefox Developer Edition / Nightly / Floorp)
If you are using Firefox Developer Edition, Firefox Nightly, or Floorp:
1. Navigate to `about:config` in your address bar and accept the warning.
2. Search for `xpinstall.signatures.required` and set it to `false`.
3. Navigate to `about:addons` (or press <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>A</kbd>).
4. Click the gear icon (⚙️) in the top-right and select **Install Add-on From File...**.
5. Select the downloaded `.zip` file.

---

## Option 2: Build and Install from Source Code (For Developers)

If you prefer building the extension from source code:

### Prerequisites
- [Node.js](https://nodejs.org/) (version 18.18 or newer)
- [npm](https://www.npmjs.com/) (version 9.0 or newer)
- [git](https://git-scm.com/)

### Build Commands

```bash
# 1. Clone the repository
git clone https://github.com/Zendevve/nexus-mods-downloader.git
cd nexus-mods-downloader

# 2. Install dependencies
npm install

# 3. Build production packages and zips
npm run package
```

The build process produces:
- `dist/chrome/` — Unpacked directory for Chromium
- `dist/firefox/` — Unpacked directory for Firefox
- `dist/nexus-download-tools-chrome-v*.zip` — Packaged Chromium zip
- `dist/nexus-download-tools-firefox-v*.zip` — Packaged Firefox zip

Follow the [Chromium](#installing-on-chromium-chrome-edge-brave-opera-vivaldi) or [Firefox](#installing-on-mozilla-firefox) steps above, selecting `dist/chrome` or `dist/firefox` as your target folder.

---

## How to Update the Extension

When a new version is released:

1. Download the new `nexus-download-tools-*-vX.X.X.zip` file from [Releases](https://github.com/Zendevve/nexus-mods-downloader/releases).
2. Extract the new zip file and **overwrite** the files in your existing extension folder.
3. Open `chrome://extensions` in your browser.
4. Locate the **Nexus Mods Download Tools** card and click the **Reload** icon (🔄 circular arrow).
5. Refresh any open Nexus Mods tabs to apply the update.

---

## Post-Installation & First Run

1. **Log in to Nexus Mods**: Make sure you are logged in to your account on [nexusmods.com](https://www.nexusmods.com). The extension uses your standard browser login session; you never need to share API keys or passwords.
2. **Open the Settings Page**: Click the extension icon in your toolbar, then click the **Settings** (⚙️) button to select your preferred preset:
   - **Solo Modder**: Instant zero-delay single downloads and countdown skips.
   - **Collection Hoarder**: 4 concurrent download workers for massive collection downloads.
   - **Cautious Free-Tier**: 1 download slot with 3s spacing to prevent rate limits.
   - **MO2 Power User**: Direct NXM protocol routing and Mod Organizer 2 `.meta` generation.
3. **Visit Nexus Mods**: Browse to any mod page or collection (e.g., `nexusmods.com/{game}/mods/{id}` or `nexusmods.com/{game}/collections/{slug}`) to see the HUD drawer, 1-click batch download controls, and requirement bundler.

---

## Frequently Asked Questions & Troubleshooting

### Q1: "Manifest file is missing or unreadable" error
- **Cause**: This happens if you select the outer wrapper folder when extracting the zip.
- **Fix**: When clicking **Load unpacked**, ensure you choose the folder that directly contains `manifest.json`, `background/`, `content/`, and `popup/`.

```
nexus-download-tools/   <── Select THIS folder
  ├── manifest.json
  ├── background/
  │    └── service-worker.js
  ├── content/
  │    └── nexus-content.js
  ├── popup/
  └── assets/
```

### Q2: Is this extension completely free?
- **Yes, 100% free and open-source.** Pre-built releases are hosted directly on GitHub Releases at no cost. There are no subscriptions, paywalls, or hidden tracking.

### Q3: Why does Chrome display "Developer mode" warnings?
- **Explanation**: Extensions loaded via "Load unpacked" run under Developer mode. This is standard behavior for sideloaded extensions. You can safely dismiss the prompt.

### Q4: How does authentication work?
- The extension does **not** store your username, password, or session cookies. All download requests are routed through standard browser fetch with your existing active session.

### Q5: What happens during Cloudflare verification?
- If Nexus Mods prompts you for a Cloudflare captcha or Turnstile challenge, the extension detects the challenge and yields control to your browser tab so you can complete verification normally. Once verified, download queues resume automatically.

---

## 💖 Support the Project

If Nexus Mods Download Tools makes your modding experience smoother, consider supporting future development and maintenance:

☕ **[Buy Me a Coffee](https://buymeacoffee.com/zendevve)**
