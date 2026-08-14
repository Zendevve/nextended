import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');

const REF_RE = /(?:src|href)="([^"]+)"/g;

function findPages(dir) {
  const out = [];
  for (const entry of readdirSyncSafe(dir)) {
    const full = join(dir, entry);
    if (existsSync(full) && statSyncSafe(full)?.isDirectory()) {
      out.push(...findPages(full));
    } else if (entry.endsWith('.html')) {
      out.push(full);
    }
  }
  return out;
}

function readdirSyncSafe(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function statSyncSafe(p) {
  try {
    return statSync(p);
  } catch {
    return null;
  }
}

describe('HTML page asset references', () => {
  const pages = findPages(SRC);
  expect(pages.length).toBeGreaterThan(0);

  for (const page of pages) {
    it(`${page.replace(SRC + '\\', '').replace(SRC + '/', '')} references exist locally`, () => {
      const html = readFileSync(page, 'utf8');
      const refs = [];
      let match;
      const re = new RegExp(REF_RE.source, 'g');
      while ((match = re.exec(html)) !== null) refs.push(match[1]);

      expect(refs.length).toBeGreaterThan(0);
      for (const ref of refs) {
        if (/^(?:https?:|chrome-extension:|data:)/.test(ref)) continue;
        // Resolve relative to the page's own directory — this is exactly the
        // check that catches a doubled directory like `popup/popup.js` inside
        // `popup/popup.html`.
        const target = resolve(dirname(page), ref);
        expect(
          existsSync(target),
          `${page} references ${ref} -> ${target} which does not exist`
        ).toBe(true);
      }
    });
  }
});
