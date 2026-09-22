# nextended

nextended is a Manifest V3 browser extension for Nexus Mods. It replaces three
userscripts — Nexus Download Collection, Nexus No Wait ++, and Nexusmods Allow archive
downloads — with one clean-room implementation: Single Downloads without countdowns or
Requirements Gates, Bulk Runs over Collections with pacing and revision diffing, and
access to Archived Files.

## What it does

- Single Download — one click (or a `file_id` URL) becomes a real download with no countdown and no Requirements Gate; unresolvable clicks yield to native Nexus behavior.
- Bulk Run — fetch a Collection's files via GraphQL, select mandatory, optional, or custom subsets, and download them as a paced sequence with pause, resume, stop, and skip controls, live progress, and a log console.
- Revision diffing — compare two Revisions of a Collection (added, updated, removed) and download only the changes.
- Local file matching — import a list of already-downloaded files and skip them (including near-miss names) in a Bulk Run.
- Archived Files — download buttons injected into archived-file tables.
- Rate-limit protection — pacing between downloads scales with file size and configured connection speed; a 5-minute cooldown after 200 downloads keeps free accounts clear of Nexus's 10-minute suspensions.
- Conflict detection — if a replaced userscript is still installed, nextended detects its Conflict Markers and shows a dismissible banner and a popup badge.
- External downloader handoff — copy download links to the clipboard, or hand them to an aria2 JSON-RPC endpoint (opt-in).

## The contract

nextended runs inside your authenticated Nexus session, so it holds itself to a
Do-No-Harm contract (ADR-0002): zero visible change to Nexus pages unless a feature is
explicitly invoked; downloads go through the same endpoints a manual click would use;
the page shield stubs only what nextended's own flows require and can be turned off;
any click nextended cannot fully resolve yields to native Nexus behavior. The
implementation is clean-room (ADR-0001): no code or verbatim selectors copied from the
replaced userscripts.

## Why not on the store?

Distribution is personal-use (ADR-0005): the maintainers' own browsers, unpacked
install. A store listing would import review processes and a support queue the project
does not want, and the license reflects that.

## Install from source

1. Clone or download this repository.
2. Build:

   ```bash
   npm install
   npm run build
   ```

3. Load the extension:
   - Chromium (Chrome, Edge, Brave): `chrome://extensions/` → enable Developer mode → Load unpacked → select the `dist/` folder.
   - Firefox: `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → select `dist/manifest.json`.

## Build and test

```bash
npm test        # vitest — 14 suites, 172 tests
npm run build   # node build.js → dist/
```

## Configuration

Settings live on the options page (auto-saved) with quick toggles in the popup.
Defaults worth knowing:

- Browser Download is the default download method everywhere; Vortex Handoff (`nxm://`) is opt-in, with protocol-handler failure detection and browser fallback (ADR-0004).
- Bulk Run pacing has a Safe Floor (ADR-0003): values below it are clamped, values above it carry a ban-risk warning.
- The page shield is on by default and can be disabled (ADR-0002).
- With `vpnMode` on, a Cloudflare-blocked download redirects you to the blocked URL so you can solve the challenge yourself.

## Project documentation

- [CHANGELOG.md](CHANGELOG.md) — releases
- [CONTEXT.md](CONTEXT.md) — domain glossary; the vocabulary this README uses
- [docs/adr/](docs/adr/) — accepted architecture decisions
- [docs/milestone-v1.1.0.md](docs/milestone-v1.1.0.md) — the v1.1.0 parity audit and plan

## Support

If nextended saves you time, you can [buy the maintainer a coffee](https://www.buymeacoffee.com/zendevve).

## License

Proprietary, all rights reserved. Source-available for personal, non-commercial use:
you may install it unpacked for your own use and study the code; modification,
redistribution, and monetization require written permission. Full terms in
[LICENSE](LICENSE).
