# Permissions

Declared in `manifest.json` (MV3). The extension asks for the minimum needed: three permissions and four host patterns. Nothing else is requested.

## Permissions

| Permission | Why it exists |
|---|---|
| `storage` | Persists `settings`, `stats`, and `collection_history` in `chrome.storage.local`; content script listens for `chrome.storage.onChanged` on the settings key |
| `downloads` | `NXDT_START_DOWNLOAD` calls `chrome.downloads.download({ url, saveAs: false })` in the service worker |
| `activeTab` | Grants one-time access to the active tab's URL and title when the user invokes the action (toolbar click or `_execute_action` shortcut, default `Ctrl+Shift+Y` / mac `Command+Shift+Y`); the popup reads `tab.url` / `tab.title` to classify the site and to target `chrome.tabs.sendMessage` for `NXDT_FOCUS_COLLECTION_PANEL` |

## Host permissions

| Pattern | Why it exists |
|---|---|
| `https://www.nexusmods.com/*` | Content script match (`matches` in `content_scripts`); the archived resolver GET (`/Core/Downloads/GenerateDownloadUrl`) and the collection resolver POST (`/Core/Libs/Common/Managers/Downloads?GenerateDownloadUrl`) with `credentials: 'include'` |
| `https://*.nexusmods.com/*` | Subdomain downloads and pages allowed by `isSafeDownloadUrl` / `isNexusHost` (hostname equal to `nexusmods.com` or ending in `.nexusmods.com`) |
| `https://*.nexus-cdn.com/*` | File downloads served from the CDN (`isCdnHost`: `nexus-cdn.com` or `*.nexus-cdn.com`) — the extracted download URLs must be fetchable |
| `https://api-router.nexusmods.com/*` | GraphQL endpoint used by `CollectionClient` (`https://api-router.nexusmods.com/graphql`) for `FETCH_COLLECTION_MODS` / `FETCH_COLLECTION_REVISIONS` |

Host scopes mirror the `isSafeDownloadUrl` allow-list in `src/nexus/url-utils.js`: the extension can only talk to Nexus hosts it declares.

## Explicitly not requested

| Not requested | Why |
|---|---|
| `<all_urls>` | Scope is strictly the Nexus hosts above; nothing needs arbitrary sites |
| `tabs` | `activeTab` is sufficient for the popup's one-shot tab url/title read; full tab-read access is unnecessary |
| `cookies` | Session cookies stay in the browser; `credentials: 'include'` on host-permissioned fetches sends them without the `cookies` permission |
| `webRequestBlocking` | The extension never intercepts or rewrites network requests |
| `nativeMessaging` | No native application integration |

## activeTab semantics

`activeTab` is granted only when the user invokes the action — clicking the toolbar icon or pressing the `_execute_action` shortcut. The grant covers the currently active tab while the popup is open: the popup can read that tab's `url`/`title` and send it a message (`NXDT_FOCUS_COLLECTION_PANEL`). It is not a standing `tabs` permission and does not persist after the popup closes.

## See also

- [Getting started](../tutorial/getting-started.md)
- [Add a setting](../how-to/add-a-setting.md)
- [Add a message type](../how-to/add-a-message-type.md)
- [Debug and verify](../how-to/debug-and-verify.md)
- [Distribute](../how-to/distribute.md)
- [Architecture](architecture.md)
- [Message protocol](message-protocol.md)
- [Settings and storage](settings-and-storage.md)
- [Errors](errors.md)
- [Security model](security-model.md)
- [Why the service worker owns everything](../explanation/why-the-service-worker-owns-everything.md)
- [How the download queue works](../explanation/how-the-download-queue-works.md)
- [Cloudflare and rate limits](../explanation/cloudflare-and-rate-limits.md)
- [The popup UX flow](../explanation/the-popup-ux-flow.md)
