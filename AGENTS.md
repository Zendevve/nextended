# Nexus Mods Download Tools — Agent Guide

## Verification
- HTML pages resolve script/style refs against their own directory. After
  touching any `src/**/*.html`, run `npm run test`: `tests/html-assets.test.js`
  fails on refs pointing outside the page — the bug that once shipped a dead popup.
- Never verify a page by inlining its bundle into a fixture (masks 404s);
  browser-smoke `dist/chrome` instead and check console for
  `requestfailed`/HTTP >= 400 resources.
- happy-dom fetches no scripts: a green happy-dom suite does not prove the page loads.
