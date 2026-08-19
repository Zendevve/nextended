# Distribute

Packaging and distribution guide for **Nexus Mods Download Tools**.

## 1. Automated Packaging

A single command builds production bundles and packages cross-platform release `.zip` archives for Chromium and Firefox:

```bash
npm run package
```

This runs `node scripts/package.mjs`, which:
1. Builds minified IIFE bundles for Chromium (`dist/chrome/`) and Firefox (`dist/firefox/`).
2. Cleans any leftover `.map` debug files.
3. Verifies that all required `manifest.json` asset references exist.
4. Generates ZIP archives with `manifest.json` placed directly at the archive root.
5. Outputs SHA-256 checksums to `dist/SHA256SUMS.txt`.

### Generated Artifacts

| Path in `dist/` | Target | Purpose |
|---|---|---|
| `dist/nexus-download-tools-chrome-v0.1.0.zip` | Chromium (Chrome, Edge, Brave, Opera, Vivaldi) | Versioned release archive |
| `dist/nexus-download-tools-chrome.zip` | Chromium | Latest release archive alias |
| `dist/nexus-download-tools-firefox-v0.1.0.zip` | Firefox (Firefox, LibreWolf, Waterfox) | Versioned release archive |
| `dist/nexus-download-tools-firefox.zip` | Firefox | Latest release archive alias |
| `dist/SHA256SUMS.txt` | All | Cryptographic checksums for release verification |

---

## 2. GitHub Releases (100% Completely Free)

GitHub Releases is the recommended, completely free distribution channel for pre-built extension packages:

1. **Zero Cost**: GitHub Releases hosting and bandwidth are 100% free for public and private GitHub repositories.
2. **Automated Publishing via GitHub Actions**: The repository includes `.github/workflows/release.yml`. When you push a version tag (e.g. `v0.1.0`), GitHub Actions automatically runs tests, packages the ZIPs, creates the GitHub Release, and uploads the `.zip` files and `SHA256SUMS.txt`.
3. **Direct User Download**: Users can download the ZIP directly and load it in under 30 seconds following the [Installation Guide](../../INSTALLATION.md).

### How to Trigger a Release:
```bash
# Commit version bump
git tag v0.1.0
git push origin v0.1.0
```
The GitHub Action will handle building, packaging, and publishing automatically.

---

## 3. Store Distribution vs GitHub Releases

| Channel | Cost | Approval Delay | Update Mechanism |
| :--- | :--- | :--- | :--- |
| **GitHub Releases** | **100% Free** | Instant (0 delay) | Manual overwrite & reload |
| **Chrome Web Store** | $5 one-time developer registration fee | 1-3 business days review | Automatic browser auto-updates |
| **Mozilla Add-ons (AMO)** | **100% Free** | 1-2 business days review / Self-distribution | Automatic browser auto-updates or signed `.xpi` |
| **Microsoft Edge Add-ons** | **100% Free** | 1-3 business days review | Automatic browser auto-updates |

---

## 4. What the ZIP Archive Contains

`manifest.json` is located at the archive root:

| Path in ZIP | Kind | Source |
|---|---|---|
| `manifest.json` | static copy | repo root (`manifest.json` or `manifest.firefox.json`) |
| `background/service-worker.js` | IIFE bundle (minified) | `src/background/service-worker.js` |
| `content/nexus-content.js` | IIFE bundle (minified) | `src/content/nexus-content.js` |
| `popup/popup.js` | IIFE bundle (minified) | `src/popup/popup.js` |
| `popup/popup.html` | static copy | `src/popup/popup.html` |
| `popup/popup.css` | static copy | `src/popup/popup.css` |
| `options/options.js` | IIFE bundle (minified) | `src/options/options.js` |
| `options/options.html` | static copy | `src/options/options.html` |
| `options/options.css` | static copy | `src/options/options.css` |
| `styles/nexus.css` | static copy | `src/styles/nexus.css` |
| `assets/icon-16.png`, `icon-32.png`, `icon-48.png`, `icon-128.png` | static copy | repo `assets/` |

---

## 5. Versioning

Update the version number in `package.json`, `manifest.json`, and `manifest.firefox.json` prior to tagging a release:

```bash
# Check consistency across manifests
npm test
```

---

## 6. Permissions & Security Policy

The extension maintains an intentionally minimal permissions footprint:
- `permissions`: `storage`, `downloads`, `activeTab`
- `host_permissions`: `https://www.nexusmods.com/*`, `https://*.nexusmods.com/*`, `https://*.nexus-cdn.com/*`, `https://api-router.nexusmods.com/*`
- **Zero Credential Storage**: The extension stores no user passwords, tokens, or cookies. Requests authenticate via the user's active Nexus Mods browser session.
- [Getting started](../tutorial/getting-started.md)
- [Add a setting](../how-to/add-a-setting.md)
- [Add a message type](../how-to/add-a-message-type.md)
- [Debug and verify](../how-to/debug-and-verify.md)
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
