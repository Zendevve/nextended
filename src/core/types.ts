// src/core/types.ts — verbatim from PRD §2.2 and §2.3.
// Pure type module: no runtime, no imports. Imported across core, background, and content.

export type PageContext =
  | { kind: "collection"; gameDomain: string; slug: string; revision: number | null }
  | { kind: "mod"; gameDomain: string; modId: string; fileId: string | null; tab: string | null }
  | { kind: "archived"; gameDomain: string; modId: string }
  | { kind: "other" };

export type ErrorClass =
  | "login"
  | "cloudflare"
  | "suspended"
  | "unresolved"
  | "network";

export type Strategy =
  | "nxm-passthrough"
  | "component-attr"
  | "api-files"
  | "page-regex"
  | "generate-nmm"
  | "generate-plain"
  | "deep-scrape";

export type RunType = "all" | "mandatory" | "optional" | "custom";
export type DownloadMode = "vortex" | "browser";
export type EngineState = "idle" | "running" | "paused" | "stopped" | "finished";
export type ItemStatus =
  | "pending"
  | "resolving"
  | "launched"
  | "done"
  | "failed"
  | "skipped";

export interface QueueItem {
  key: string; // `${gameDomain}:${modId}:${fileId}`
  fileId: string;
  modId: string;
  gameDomain: string;
  gameNumericId: number; // needed by GenerateDownloadUrl
  modName: string;
  fileName: string;
  fileUri: string; // for v1.1 disk import
  sizeKB: number;
  optional: boolean;
  modPageUrl: string; // .../mods/{modId}?tab=files&file_id={fileId}
  status: ItemStatus;
  strategy?: Strategy;
  errorClass?: ErrorClass;
  updatedAt: number;
}

export interface BulkRun {
  runId: string;
  gameDomain: string;
  collectionSlug: string;
  revision: number | null;
  runType: RunType;
  mode: DownloadMode;
  itemKeys: string[];
  cursor: number; // index of next item
  engine: EngineState;
  startedAt: number;
  updatedAt: number;
}

export interface BudgetState {
  launches: number[]; // timestamps within window
  cooldownUntil: number | null;
}

export interface DedupeEntry {
  key: string;
  launchedAt: number;
}

export interface CollectionHistory {
  [runType: string]: string[]; // fileIds downloaded for this runType
}

export interface CollectionHistoryMap {
  [slug: string]: CollectionHistory;
}

export interface HistoryMap {
  [gameDomain: string]: CollectionHistoryMap;
}
