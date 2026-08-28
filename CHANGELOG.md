# Changelog

All notable changes to the Nextended project will be documented in this file.

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
