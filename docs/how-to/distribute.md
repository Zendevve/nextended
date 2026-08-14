# Distribute

Recipe for packaging the extension for distribution. One build command produces everything under `dist/chrome/`; the zip is the contents of that directory.

## 1. Fresh build

```bash
npm run build
```

`build` runs `node scripts/build.mjs` (esbuild, IIFE bundles, target `es2020`, minified). The build does not clean `dist/chrome/`: if you previously ran `npm run dev` (watch mode), stale `*.js.map` files may linger — production builds emit no source maps (`sourcemap` is enabled only in watch mode), so delete any leftover maps before packaging:

```bash
rm -f dist/chrome/background/*.js.map dist/chrome/content/*.js.map \
      dist/chrome/popup/*.js.map dist/chrome/options/*.js.map
```

## 2. What the output contains

`dist/chrome/` after a production build:

| Path | Kind | Source |
|---|---|---|
| `manifest.json` | static copy | repo root |
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

The manifest references these exact paths: service worker `background/service-worker.js` (`"type": "module"`), content script `content/nexus-content.js` + `styles/nexus.css`, action popup `popup/popup.html`, options page `options/options.html`, icons `assets/icon-*.png`. Every referenced file must be present in the zip.

## 3. What to zip

Zip the **contents of `dist/chrome/`** — `manifest.json` at the archive root, not inside a `chrome/` folder. Loading unpacked uses `dist/chrome/` directly; a store upload needs the same layout in a `.zip`. Verify the archive against the manifest table above before uploading.

Smoke the exact artifact you ship: load `dist/chrome` as an unpacked extension and run the real-extension check (see `../how-to/debug-and-verify.md`) — console clean of `requestfailed`/HTTP ≥ 400, popup and options pages populated.

## 4. Versioning

The version lives in one place: `manifest.json` `"version"` (currently `0.1.0`, matching `package.json`). Bump it before each build; the build copies the manifest verbatim into `dist/chrome/`. Chrome Web Store versions use this value; the store does not accept a version you have already used in that account.

## 5. Chrome Web Store considerations

The permission surface is deliberately narrow and is what the store review sees:

- `permissions`: `storage`, `downloads`, `activeTab` only.
- `host_permissions`: `https://www.nexusmods.com/*`, `https://*.nexusmods.com/*`, `https://*.nexus-cdn.com/*`, `https://api-router.nexusmods.com/*`.
- Not requested: `<all_urls>`, `tabs`, `cookies`, `webRequestBlocking`, `nativeMessaging`.

Keep it that way — each permission added on top of this list is a review question. The extension stores no credentials: it never requests the `cookies` permission, keeps no tokens or passwords in `chrome.storage`, and relies only on the user's existing Nexus session cookies, sent via `credentials: 'include'` on service-worker fetches to Nexus hosts. New handlers must follow the same rule: no secret material written to storage, no permissions beyond what the feature provably needs.

Also relevant to the listing: MV3 service worker (no background pages), an `open_in_tab` options page, and the `_execute_action` command bound to Ctrl+Shift+Y / Cmd+Shift+Y.

## 6. License

The project is proprietary with limited personal use (`"license": "UNLICENSED"` in `package.json`, version `0.1.0`). Keep the license terms attached to the distributed package and state them in the store listing; nothing in the build adds or implies an open-source license.

## See also

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
