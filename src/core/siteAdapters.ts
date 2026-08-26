// src/core/siteAdapters.ts — the SOLE file allowed to contain regex /
// selector / URL / GraphQL string literals (selector quarantine, PRD §1.6,
// §5.3). The ESLint rule fails the build if such literals appear elsewhere.

import type { PageContext } from "./types.js";

// =============================================================================
// URL routes
// =============================================================================

export const GAME_DOMAIN_RE = "[a-z0-9_-]{2,64}";
export const GAME_NUMERIC_ID_RE = "[0-9]{1,10}";
export const MOD_ID_RE = "[0-9]{1,12}";
export const FILE_ID_RE = "[0-9]{1,12}";
export const COLLECTION_SLUG_RE = "[A-Za-z0-9_.-]{1,128}";
export const REVISION_RE = "[0-9]{1,10}";

export const ROUTE_COLLECTION = new RegExp(
  `^/games/(${GAME_DOMAIN_RE})/collections/(${COLLECTION_SLUG_RE})` +
    `(?:/revisions/(${REVISION_RE}))?/?(?:[?#].*)?$`,
  "i",
);

export const ROUTE_MOD_ROOT = new RegExp(
  `^/(${GAME_DOMAIN_RE})/mods/(${MOD_ID_RE})(?:[/?#].*)?$`,
  "i",
);

export const ROUTE_SEARCH = /\/search\/?(?:[?#].*)?$/i;
export const ROUTE_FORUM = /\/(forum|forums)\//i;
export const ROUTE_COMMENTS = /#comment/i;
export const ROUTE_PAGINATION = /[?&]page=\d+/i;

const HOSTNAME_RE = /(?:^|\.)nexusmods\.com$/i;

export const HTTP_URL_RE = /^https?:\/\//i;

// =============================================================================
// Component / web-component attribute names (FR3 strategy 2)
// =============================================================================

export const MODAL_TAG = "MOD-DOWNLOAD-MODAL";
export const BUTTONS_TAG = "MOD-DOWNLOAD-BUTTONS";
export const FILE_DOWNLOAD_TAG = "MOD-FILE-DOWNLOAD";

export const SECURE_DOWNLOAD_KEYS = [
  "secureDownloadUrl",
  "downloadUrl",
  "vortexDownloadUrl",
] as const;

// =============================================================================
// Resolver strategy-4 regex list (mod-page HTML scrape, FR3)
// =============================================================================
//
// First matching group wins. CDN patterns come first so manifest-signed
// downloads are preferred over raw mod-page links.
export const PAGE_REGEX_URL_PATTERNS: readonly RegExp[] = [
  /\b(https?:\/\/[A-Za-z0-9.\-]*nexus-cdn\.com\/[^\s"'<>)]*?[A-Za-z0-9._\-]+\.zip)(\?[^\s"'<>)]*)?/i,
  /\b(https?:\/\/[A-Za-z0-9.\-]*nexusmods\.com\/[^\s"'<>)]*?[A-Za-z0-9._\-]+\.zip)(\?[^\s"'<>)]*)?/i,
  /\/(?:Core|Libs|downloads)\/(?:File|Download|Manager)[^\s"'<>)]*?\bdownloadId=(\d+)/i,
  /\bdata-(?:file|download)-url\s*=\s*"([^"]+)"/i,
  /\bhref\s*=\s*"(nxm:\/\/[^"]+)"/i,
];

// =============================================================================
// nxm:// URL grammar (FR3 strategy 1 + Script C legacy URL)
// =============================================================================

export const NXM_URL_RE =
  /^nxm:\/\/[^/]+\/mods\/[0-9]+\/files\/[0-9]+/i;

export const LEGACY_ARCHIVE_POPUP_RE =
  /^ModRequirementsPopUp\?id=([0-9]+)&game_id=([0-9]+)/i;

// =============================================================================
// Module-specific regex / selectors
// =============================================================================

export const SLOW_DOWNLOAD_BTN_RE = /^slow download$/i;

// =============================================================================
// Classification signals (used by errorClassifier)
// =============================================================================
//
// Page-content / response-content markers the classifier needs. Co-located
// with site knowledge to keep the quarantine rule simple and exhaustive.
export const CF_HEADER_KEYS = [
  "cf-ray",
  "cf-mitigated",
  "cf-cache-status",
  "cf-chl-bypass",
] as const;

export const LOGIN_MARKERS: readonly RegExp[] = [
  /class="[^"]*\blogin\b/i,
  /<title>[^<]*sign\s*in[^<]*<\/title>/i,
  /"requiresLogin"\s*:\s*true/i,
];

export const CF_MARKERS: readonly RegExp[] = [
  /cf-turnstile/i,
  /just a moment/i,
  /checking your browser/i,
  /<title>[^<]*just a moment[^<]*<\/title>/i,
];

export const SUSPENDED_MARKERS: readonly RegExp[] = [
  /temporarily\s+suspended/i,
  /account\s+(?:has\s+been\s+)?suspended/i,
  /"suspendedUntil"\s*:/i,
];

// Archive module selectors.
export const ARCHIVE_FILE_ID_RE = /[?&]file_id=(\d+)/;
export const ARCHIVE_LEGACY_POPUP_RE = /(?:id|file_id)=(\d+)/;
export const ARCHIVE_GAME_MOD_PATH_RE = /^\/([^/]+)\/mods\/(\d+)/;
export const ARCHIVE_FILE_LINK_SELECTOR = 'a[href*="file_id="]';
export const ARCHIVE_FALLBACK_LINK_SELECTOR =
  'a[href*="ModRequirementsPopUp"], a[href*="file_id="]';

// =============================================================================
// Endpoints
// =============================================================================

export const ENDPOINT_NEXUS_BASE = "https://www.nexusmods.com";
export const ENDPOINT_CDN_BASE = "https://www.nexus-cdn.com";

export const ENDPOINT_GENERATE_DOWNLOAD_URL = `${ENDPOINT_NEXUS_BASE}/Core/Libs/Common/Managers/Downloads?GenerateDownloadUrl`;
export const ENDPOINT_API_FILES = `${ENDPOINT_NEXUS_BASE}/api/files`;
export const ENDPOINT_GRAPHQL = "https://api.nexusmods.com/v2/graphql";

// =============================================================================
// GraphQL — CollectionRevision (FR2)
// =============================================================================

export const GQL_COLLECTION_REVISION_MODS = /* GraphQL */ `
  query CollectionRevisionMods(
    $slug: String!
    $domainName: String!
    $revision: Int!
    $viewAdultContent: Boolean!
  ) {
    collectionRevision(
      slug: $slug
      domainName: $domainName
      revision: $revision
      viewAdultContent: $viewAdultContent
    ) {
      id
      revisionNumber
      collection {
        id
        name
        slug
        game {
          id
          domainName
        }
      }
      modFiles {
        optional
        fileId
        file {
          name
          sizeInBytes
          uri
          mod {
            id
            name
          }
        }
      }
    }
  }
`;

export const GQL_COLLECTION_BY_SLUG = /* GraphQL */ `
  query CollectionBySlug(
    $slug: String!
    $domainName: String!
    $viewAdultContent: Boolean!
  ) {
    collection(slug: $slug, domainName: $domainName, viewAdultContent: $viewAdultContent) {
      id
      name
      slug
      latestPublishedRevision {
        id
        revisionNumber
      }
    }
  }
`;

// =============================================================================
// Page-context parser (PRD §2.2)
// =============================================================================

export function parseRoute(input: string | URL): PageContext {
  let url: URL;
  try {
    url = typeof input === "string" ? new URL(input) : new URL(input.toString());
  } catch {
    return { kind: "other" };
  }
  if (!HOSTNAME_RE.test(url.hostname)) {
    return { kind: "other" };
  }
  const path = url.pathname;
  const params = url.searchParams;

  const c = path.match(ROUTE_COLLECTION);
  if (c) {
    const [, gameDomain, slug, rev] = c as unknown as [
      string,
      string,
      string,
      string | undefined,
    ];
    return {
      kind: "collection",
      gameDomain,
      slug,
      revision: rev ? Number.parseInt(rev, 10) : null,
    };
  }

  const m = path.match(ROUTE_MOD_ROOT);
  if (m) {
    const [, gameDomain, modIdRaw] = m as unknown as [string, string, string];
    const modId = modIdRaw;
    const tab = params.get("tab");
    const fileId = params.get("file_id");
    const category = params.get("category");
    const isArchived = tab === "files" && category === "archived";
    if (isArchived) {
      return { kind: "archived", gameDomain, modId };
    }
    return { kind: "mod", gameDomain, modId, fileId, tab };
  }

  return { kind: "other" };
}

export function isExcludedPath(input: string | URL): boolean {
  let url: URL;
  try {
    url = typeof input === "string" ? new URL(input) : new URL(input.toString());
  } catch {
    return true;
  }
  const path = url.pathname + url.hash;
  const search = url.search;
  if (ROUTE_SEARCH.test(path) || ROUTE_FORUM.test(path)) return true;
  if (ROUTE_PAGINATION.test(search)) return true;
  if (ROUTE_COMMENTS.test(path)) return true;
  return false;
}

// =============================================================================
// Site adapter version — emit in debug logs so bug reports are diagnosable
// (PRD §1.8 risk row "Nexus HTML/GraphQL drift")
// =============================================================================

export const SITE_ADAPTER_VERSION = "nextended-siteAdapters@1.0.0";
