# Changelog

All notable changes to the Nextended project will be documented in this file.

## [1.1.0] - 2026-09-21

"Parity & Contract" — gap-closing release against the three replaced userscripts.
Decisions are backed by ADR-0001…0005; the audit and plan live in
`docs/milestone-v1.1.0.md`.

### Changed

- Browser Download is the default download method for Single Downloads and Bulk Runs alike; Vortex Handoff (`nxm://`) is opt-in, with protocol-handler failure detection and browser fallback (ADR-0004).
- Safe Floor enforced on Bulk Run pacing: values below the floor are clamped, values above it carry a ban-risk warning (ADR-0003).
- Page shield is opt-out via config with a fail-open gate (ADR-0002, clause 3).
- `vpnMode` wired: Cloudflare-blocked downloads redirect to the blocked URL so the challenge can be solved naturally.
- Options page reconciled with the live config keys; dead keys removed.
- Archive-injector wrapper class renamed to a nextended namespace, removing a verbatim selector inherited from the CC BY-NC-SA script (ADR-0001).

### Added

- External downloader handoff: download links copied to the clipboard by default, aria2 JSON-RPC handoff opt-in.
- Userscript Conflict Marker detection: dismissible on-page banner and popup badge with a persisted acknowledgment.
- Selection JSON export/import in the collection select-mods modal.
- Mod-manager button injection on manual-only files, behind the existing `forceModManagerDownload` toggle.

### Fixed

- Duplicate `host_permissions` key in `manifest.json` silently dropped entries, including the localhost aria2-RPC scope.
- `overrideFileNames` now appends the mod id to overridden filenames instead of only uniquifying them.
- FileMatcher: URIs shorter than 12 characters were rejected by the gram prefilter, and the exact-hit early return left containing files unflagged; match flags now derive from a reverse gram index, restoring upstream semantics (verified with 600 randomized differential cases).
- FileMatcher wired into collection history import with near-miss matching, replacing naive `name.includes(uri)` checks.
- `requestTimeoutMs` enforced on all GraphQL and widget fetches via abort signals.

### Performance

- Content-script hot paths rebuilt (marker fast-paths, FNV-1a 12-gram file matching, single-pass revision diffing): the collection-import path measured ~36ms down to ~10ms in the bench harness, with behavior checksum-stable throughout.

### Tests

- 172 tests across 14 suites, up from 82 across 8.

## [1.0.2] - 2026-08-28

### Fixed
- **Solo Mod Download Resolution**: Fixed "Could not resolve download link" error on individual/standalone mod pages (e.g. Stardew Valley mod 51105, Skyrim mod 49397).
- **Primary File ID Resolution**: Added `fetchPrimaryModFileId` via GraphQL router and `ClickInterceptor.resolveFileId` to automatically determine the primary file ID when clicking header "Manual Download" or "Vortex" buttons on mod description pages.
- **Game ID & Domain Matching**: Added numeric game ID resolution for domain slugs (`stardewvalley -> 1303`, `skyrim -> 110`, etc.) when calling `GenerateDownloadUrl`.
- **Expanded Widget Pop-up Endpoints**: Added fallback queries for `DownloadPopUp`, `ModRequirementsPopUp`, `ModDownloadPopUp`, and `RequirementsPopUp` widget endpoints.
- **Page Shield Tracking Protection**: Added comprehensive `window.statistics`, `ramp.statistics`, `Nexus.statistics`, `user.statistics`, and `analytics.statistics` stubs plus global error/unhandledrejection handlers in the main world to prevent ad-blocker blocked scripts (`net::ERR_BLOCKED_BY_CLIENT`) from halting Nexus page interactive elements.
- **Fallback Page Redirection**: Gracefully redirects to the file download page or files tab if all direct API generation steps fail, eliminating blocking error modals.
- **Click Interception Coverage**: Removed premature early-returns on `popup-btn-ajax` elements to ensure all download buttons and custom web components (`<MOD-DOWNLOAD-BUTTONS>`, `.file-expander-header`) are captured.

### Added
- **Unit Test Coverage**: Added comprehensive test suites across `clickInterceptor.test.ts`, `singleDownloader.test.ts`, and `pageShield.test.ts` (82 total unit tests passing).

## [1.0.1] - 2026-08-28

### Added
- MAIN-world page shield for blocked analytics and PhotoSwipe fullscreen error handling.
- Options auto-save and popup status indicators.

## [1.0.0] - 2026-08-27

### Added
- Initial release of Nextended: Manifest V3 power suite for Nexus Mods.
- Bulk collections batch downloader with automatic rate limiting and pause management.
- Instant single mod downloader and requirements bypass.
- Archive unlock injector.
