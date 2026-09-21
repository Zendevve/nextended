export enum DownloadMethod {
  VORTEX = 0,
  BROWSER = 1
}

export interface ExtensionConfig {
  autoStartDownload: boolean;
  autoCloseTab: boolean;
  closeTabDelayMs: number;
  skipRequirements: boolean;
  forceModManagerDownload: boolean;
  handleArchivedFiles: boolean;
  downloadButtonColor: boolean;
  overrideFileNames: boolean;
  vpnMode: boolean;
  showAlertsOnError: boolean;
  playErrorSound: boolean;
  requestTimeoutMs: number;
  downloadSpeedMb: number;
  pauseBetweenDownloadSec: number;
  downloadMethod: DownloadMethod;
  externalDownloader: ExternalDownloaderConfig;
  pageShieldEnabled: boolean;
}

export enum ExternalDownloaderMode {
  CLIPBOARD = 'clipboard',
  ARIA2 = 'aria2'
}

export interface ExternalDownloaderConfig {
  enabled: boolean;
  mode: ExternalDownloaderMode;
  rpcUrl: string;
  secret: string;
}

export interface CollectionModFile {
  fileId: number;
  optional: boolean;
  file: {
    fileId: number;
    name: string;
    uri: string;
    size: number; // in KB
    version: string;
    date: number;
    url?: string;
    mod: {
      modId: number;
      name: string;
      version: string;
      adult: boolean;
      game: {
        id: number;
        domainName: string;
      };
    };
  };
}

export interface CollectionRevisionMetadata {
  id: string;
  revisionNumber: number;
  revisionStatus: string;
  totalSize: number;
  modCount: number;
  createdAt: string;
  discardedAt?: string | null;
  adultContent: boolean;
}

export interface CollectionRevisionData {
  externalResources: Array<{
    id: string;
    name: string;
    resourceType: string;
    resourceUrl: string;
  }>;
  modFiles: CollectionModFile[];
}

export interface DownloadResolutionResult {
  url: string | null;
  error?: string;
  blockedUrl?: string;
  rawText?: string;
}

export interface DownloadHistoryStore {
  [gameDomain: string]: {
    [collectionSlug: string]: {
      all: number[];
      mandatory: number[];
      optional: number[];
    };
  };
}

export interface DownloadRateLimitState {
  count: number;
  lastResetTimestamp: number;
}

/** Content-script request for the background worker to start a browser download. */
export interface TriggerDownloadMessage {
  type: 'TRIGGER_DOWNLOAD';
  url: string;
  filename?: string;
  /** Nexus mod id, used to tag overridden filenames as `name-modid.ext`; omitted when unknown. */
  modId?: string | number;
}

/** Foreign userscript Conflict Markers nextended knows how to detect (issue #13). */
export type ConflictScriptId = 'ndc-toolbar' | 'nnwpp-attrs' | 'legacy-archive-wrapper';

/** Display names for the replaced userscripts, shared by the content banner and popup badge. */
export const CONFLICT_SCRIPT_LABELS: Record<ConflictScriptId, string> = {
  'ndc-toolbar': 'NDC collection toolbar',
  'nnwpp-attrs': 'NNWPP userscript',
  'legacy-archive-wrapper': 'legacy archive unlock script'
};

/** Acknowledged conflicts: dismissal persists which scripts the user has already been warned about. */
export interface ConflictAckStore {
  ackedAt: number;
  scripts: ConflictScriptId[];
}

/** Current Conflict Marker detection state, persisted for the popup badge. */
export interface ConflictDetectionState {
  detected: ConflictScriptId[];
  unacknowledged: ConflictScriptId[];
  updatedAt: number;
}
