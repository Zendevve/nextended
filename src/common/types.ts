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
