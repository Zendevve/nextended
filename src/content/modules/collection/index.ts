// src/content/modules/collection/index.ts — collection module mount/unmount.
// FR2. Wires the engine, the panel, and the GraphQL fetch together.

import type { Module } from "../../../content/router.js";
import type { PageContext, QueueItem, RunType } from "../../../core/types.js";
import { settings } from "../../../content/settings-bridge.js";
import {
  fetchCollectionBySlug,
  fetchCollectionRevisionMods,
  fetchHttpClient,
  makeGraphQL,
} from "../../../core/graphql.js";
import { engine, CollectionEngine } from "./engine.js";
import { mountPanel } from "./panel.js";
import { openSelectionModal } from "./selectModal.js";
import { showToast } from "../../../content/ui/toast.js";
import { ensureHost } from "../../../content/ui/root.js";
import { dedupeKey } from "../../../core/keys.js";

let unsubPanel: (() => void) | null = null;
let isMounted = false;
let activeCtx: { gameDomain: string; slug: string; revision: number | null } | null = null;

function isCollection(ctx: PageContext): ctx is Extract<PageContext, { kind: "collection" }> {
  return ctx.kind === "collection";
}

async function buildItemsForCtx(
  ctx: Extract<PageContext, { kind: "collection" }>,
): Promise<QueueItem[]> {
  const gql = makeGraphQL(fetchHttpClient());
  let revisionNumber = ctx.revision;
  if (revisionNumber === null) {
    const collection = await fetchCollectionBySlug(gql, {
      slug: ctx.slug,
      domainName: ctx.gameDomain,
      viewAdultContent: true,
    });
    revisionNumber = collection?.latestPublishedRevision?.revisionNumber ?? null;
  }
  if (revisionNumber === null) {
    showToast({ message: "Could not resolve collection revision.", variant: "error" });
    return [];
  }
  const dto = await fetchCollectionRevisionMods(gql, {
    slug: ctx.slug,
    domainName: ctx.gameDomain,
    revision: revisionNumber,
    viewAdultContent: true,
  });
  const gameNumericId = Number(dto.collection.game.id);
  const items: QueueItem[] = [];
  for (const m of dto.modFiles) {
    const fileId = String(m.fileId);
    const modId = String(m.file.mod.id);
    const sizeBytes = Number(m.file.sizeInBytes) || 0;
    const sizeKB = Math.round(sizeBytes / 1024);
    items.push({
      key: dedupeKey(ctx.gameDomain, modId, fileId),
      fileId,
      modId,
      gameDomain: ctx.gameDomain,
      gameNumericId,
      modName: m.file.mod.name,
      fileName: m.file.name,
      fileUri: m.file.uri,
      sizeKB,
      optional: m.optional,
      modPageUrl: `https://www.nexusmods.com/${ctx.gameDomain}/mods/${modId}?tab=files&file_id=${fileId}`,
      status: "pending",
      updatedAt: Date.now(),
    });
  }
  return items;
}

export const collectionModule: Module<{ items: QueueItem[] }> = {
  matches(ctx) {
    return ctx.kind === "collection";
  },
  loadState() {
    return { items: [] };
  },
  async mount(ctx) {
    if (!isCollection(ctx)) return;
    if (isMounted) return;
    isMounted = true;
    activeCtx = { gameDomain: ctx.gameDomain, slug: ctx.slug, revision: ctx.revision };
    ensureHost();

    await engine.resumeIfAny();

    const startHandler = async (runType: RunType) => {
      if (!isCollection(ctx)) return;
      const allItems = await buildItemsForCtx(ctx);
      if (allItems.length === 0) return;
      let selected: QueueItem[] = allItems;
      if (runType === "mandatory") selected = allItems.filter((i) => !i.optional);
      else if (runType === "optional") selected = allItems.filter((i) => i.optional);
      else if (runType === "custom") {
        const result = await openSelectionModal(allItems);
        if (result.keys.length === 0) return;
        const set = new Set(result.keys);
        selected = allItems.filter((i) => set.has(i.key));
      }
      const newEngine = engine as unknown as CollectionEngine;
      await newEngine.start({
        runId: `run-${Date.now().toString(36)}`,
        gameDomain: ctx.gameDomain,
        collectionSlug: ctx.slug,
        revision: ctx.revision,
        runType,
        items: selected,
      });
    };

    unsubPanel = mountPanel(
      engine,
      {
        setMode: (_mode) => {
          // Mode is read at start() time; mid-run mode switching is not
          // supported (PRD §2.6).
        },
        start: startHandler,
        pause: () => engine.pause(),
        resume: () => engine.resume(),
        stop: () => engine.stop(),
        skipPause: () => engine.skipPauseForNext(),
        setCursor: (i) => engine.setCursor(i),
      },
      engine.snapshot(),
    );
  },
  unmount() {
    unsubPanel?.();
    unsubPanel = null;
    isMounted = false;
    activeCtx = null;
  },
};
