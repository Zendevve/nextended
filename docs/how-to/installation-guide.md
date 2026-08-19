# Installation Guide

Comprehensive installation instructions for installing and updating the **Nexus Mods Download Tools** extension on all supported web browsers.

---

## 1. Quick Download & Install (Pre-Built Releases)

Pre-built releases are published on GitHub Releases at no cost.

1. Go to the [Releases page](https://github.com/Zendevve/nexus-mods-downloader/releases/latest).
2. Download the release archive for your browser:
   - **Chromium** (Chrome, Edge, Brave, Opera, Vivaldi): `nexus-download-tools-chrome-v*.zip`
   - **Firefox** (Firefox, LibreWolf, Waterfox): `nexus-download-tools-firefox-v*.zip`
3. Extract the ZIP archive to a folder on your computer (e.g. `C:\Extensions\nexus-download-tools` or `~/Extensions/nexus-download-tools`).

### Chromium Setup (Chrome, Edge, Brave, Opera, Vivaldi)

1. Open your browser's extension settings:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
   - Brave: `brave://extensions`
   - Opera: `opera://extensions`
2. Enable the **Developer mode** toggle in the top-right corner.
3. Click the **Load unpacked** button in the top-left toolbar.
4. Select the extracted folder that directly contains `manifest.json`.
5. Pin the extension to your toolbar using the Extensions (puzzle piece) icon.

### Firefox Setup

1. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**.
3. Select the `manifest.json` file inside your extracted Firefox folder.

---

## 2. Developer Setup (Build from Source)

```bash
# 1. Clone the repository
git clone https://github.com/Zendevve/nexus-mods-downloader.git
cd nexus-mods-downloader

# 2. Install dependencies
npm install

# 3. Build & package extension
npm run package
```

Built unpacked folders and release archives will be generated in `dist/`:
- `dist/chrome/` — Unpacked directory for Chromium browsers
- `dist/firefox/` — Unpacked directory for Firefox browsers
- `dist/nexus-download-tools-chrome-v*.zip` — Packaged Chromium ZIP
- `dist/nexus-download-tools-firefox-v*.zip` — Packaged Firefox ZIP
- `dist/SHA256SUMS.txt` — Cryptographic verification checksums

---

## 3. How to Update

1. Download the latest version ZIP from GitHub Releases.
2. Extract and overwrite the files in your existing extension folder.
3. In `chrome://extensions` (or your browser's extension page), click the **Reload** button (circular arrow) on the extension card.
4. Refresh open Nexus Mods tabs.

---

## 4. Verification & Testing

To verify the extension is functioning correctly:

1. Click the extension toolbar icon or press <kbd>Ctrl+Shift+Y</kbd> (<kbd>Cmd+Shift+Y</kbd> on macOS).
2. Confirm the extension status shows active and green.
3. Browse to any Nexus Mods page (e.g., Skyrim, Fallout 4, Cyberpunk 2077, Stardew Valley).
4. Verify the floating HUD drawer, collection download bar, and requirement buttons appear.

---

## See Also

- [Getting Started Tutorial](../tutorial/getting-started.md)
- [Distribution Guide](distribute.md)
- [Debugging and Verification](debug-and-verify.md)
- [Architecture Reference](../reference/architecture.md)
