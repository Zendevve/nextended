// src/content/modules/archive/index.ts — archived-file button injection.
// FR5. Mounts on `archived` PageContext.

import type { Module } from "../../../content/router.js";
import type { PageContext } from "../../../core/types.js";
import { settings } from "../../../content/settings-bridge.js";
import {
  NXM_URL_RE,
  ARCHIVE_FILE_ID_RE,
  ARCHIVE_LEGACY_POPUP_RE,
  ARCHIVE_GAME_MOD_PATH_RE,
  ARCHIVE_FILE_LINK_SELECTOR,
  ARCHIVE_FALLBACK_LINK_SELECTOR,
} from "../../../core/siteAdapters.js";

const MARKER = "data-nextended-archive-button";
const injected = new WeakSet<HTMLElement>();

function isArchivedRow(el: HTMLElement): boolean {
  if (el.getAttribute(MARKER)) return false;
  return (
    el.querySelector(ARCHIVE_FILE_LINK_SELECTOR) !== null ||
    el.textContent?.includes("Archived") === true
  );
}

function buildButtons(
  modId: string,
  gameDomain: string,
  fileId: string,
  modPageUrl: string,
): HTMLElement {
  const wrap = document.createElement("span");
  wrap.setAttribute(MARKER, "1");
  wrap.className = "nextended-archive-buttons";
  wrap.style.display = "inline-flex";
  wrap.style.gap = "6px";
  wrap.style.marginLeft = "8px";

  const manual = document.createElement("a");
  manual.className = "btn inline-flex";
  manual.textContent = "Manual";
  manual.href = `${modPageUrl}&file_id=${fileId}&nmm=1`;
  manual.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const nxm = `nxm://${gameDomain}/mods/${modId}/files/${fileId}`;
    if (NXM_URL_RE.test(nxm)) window.location.assign(nxm);
  });

  const mod = document.createElement("a");
  mod.className = "btn inline-flex";
  mod.textContent = "Mod manager";
  mod.href = `${modPageUrl}&file_id=${fileId}&nmm=1`;
  mod.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const nxm = `nxm://${gameDomain}/mods/${modId}/files/${fileId}?nmm=1`;
    if (NXM_URL_RE.test(nxm)) window.location.assign(nxm);
  });

  wrap.appendChild(manual);
  wrap.appendChild(mod);
  return wrap;
}

function injectAll(modId: string, gameDomain: string): void {
  const live = settings.snapshot();
  if (!live.archivedButtons) return;
  const candidates = document.querySelectorAll<HTMLElement>("tr, li, article");
  for (const row of candidates) {
    if (injected.has(row)) continue;
    if (!isArchivedRow(row)) continue;
    const fileLink = row.querySelector<HTMLAnchorElement>(ARCHIVE_FILE_LINK_SELECTOR);
    if (!fileLink) continue;
    const fileIdMatch = fileLink.href.match(ARCHIVE_FILE_ID_RE);
    if (!fileIdMatch) continue;
    const fileId = fileIdMatch[1] ?? "";
    if (!fileId) continue;
    const modPageUrl = `https://www.nexusmods.com/${gameDomain}/mods/${modId}`;
    row.appendChild(buildButtons(modId, gameDomain, fileId, modPageUrl));
    injected.add(row);
  }

  if (document.querySelectorAll(`[${MARKER}]`).length === 0) {
    const footer = document.querySelector<HTMLAnchorElement>(ARCHIVE_FALLBACK_LINK_SELECTOR);
    if (footer) {
      const m = footer.href.match(ARCHIVE_LEGACY_POPUP_RE);
      const gameMatch = location.pathname.match(ARCHIVE_GAME_MOD_PATH_RE);
      if (m && gameMatch) {
        const fileId = m[1] ?? "";
        const dGame = gameMatch[1] ?? "";
        const dMod = gameMatch[2] ?? "";
        if (fileId && dGame && dMod) {
          const modPageUrl = `https://www.nexusmods.com/${dGame}/mods/${dMod}`;
          footer.parentElement?.appendChild(buildButtons(dMod, dGame, fileId, modPageUrl));
        }
      }
    }
  }
}

let observer: MutationObserver | null = null;

export const archiveModule: Module<undefined> = {
  matches(ctx: PageContext) {
    return ctx.kind === "archived";
  },
  mount(ctx) {
    if (ctx.kind !== "archived") return;
    injectAll(ctx.modId, ctx.gameDomain);
    observer = new MutationObserver(() => injectAll(ctx.modId, ctx.gameDomain));
    observer.observe(document.body, { childList: true, subtree: true });
  },
  unmount() {
    observer?.disconnect();
    observer = null;
  },
};
