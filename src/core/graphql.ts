// src/core/graphql.ts — typed GraphQL client for the CollectionRevisionMods query.
// Network semantics preserved from the userscript GM_xmlhttpRequest port (PRD §3.3):
// credentials: "include" so the session cookie rides along, no custom headers.

import {
  ENDPOINT_GRAPHQL,
  GQL_COLLECTION_REVISION_MODS,
  GQL_COLLECTION_BY_SLUG,
} from "./siteAdapters.js";

export interface HttpResponse<T = unknown> {
  status: number;
  ok: boolean;
  body: T;
  headers: Record<string, string>;
}

export interface HttpClient {
  fetch(input: {
    url: string;
    method?: "GET" | "POST";
    body?: string;
    headers?: Record<string, string>;
    credentials?: "include" | "omit" | "same-origin";
    signal?: AbortSignal;
  }): Promise<HttpResponse>;
}

export interface GraphQLClient {
  fetch<T>(args: { query: string; variables: Record<string, unknown> }): Promise<HttpResponse<T>>;
}

export function fetchHttpClient(): HttpClient {
  return {
    async fetch(input) {
      const init: RequestInit = { credentials: input.credentials ?? "include" };
      if (input.method) init.method = input.method;
      if (input.body !== undefined) init.body = input.body;
      if (input.headers) init.headers = input.headers;
      if (input.signal) init.signal = input.signal;
      const res = await fetch(input.url, init);
      const text = await res.text();
      let body: unknown = text;
      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("application/json")) {
        try {
          body = JSON.parse(text);
        } catch {
          body = text;
        }
      }
      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        headers[k.toLowerCase()] = v;
      });
      return { status: res.status, ok: res.ok, body, headers };
    },
  };
}

export function makeGraphQL(client: HttpClient): GraphQLClient {
  return {
    async fetch<T>(args: { query: string; variables: Record<string, unknown> }) {
      const response = await client.fetch({
        url: ENDPOINT_GRAPHQL,
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: args.query, variables: args.variables }),
        credentials: "include",
      });
      return response as HttpResponse<T>;
    },
  };
}
// =============================================================================
// Domain types
// =============================================================================

export interface ModFileDTO {
  fileId: string;
  name: string;
  uri: string;
  sizeKB: number;
  version?: string;
  description?: string;
}

export interface CollectionModDTO {
  position: number;
  optional: boolean;
  mod: {
    id: string;
    name: string;
    modFiles: ModFileDTO[];
  };
}

export interface CollectionRevisionDTO {
  id: string;
  collection: {
    id: string;
    name: string;
    slug: string;
    game: { id: string; domainName: string };
  };
  mods: CollectionModDTO[];
}

export interface CollectionBySlugNode {
  id: string;
  name: string;
  slug: string;
  latestPublishedRevision: { id: string; revisionNumber: number } | null;
}

interface GqlEnvelope<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

// =============================================================================
// Operations
// =============================================================================

export async function fetchCollectionRevisionMods(
  gql: GraphQLClient,
  args: { revisionId: string; viewAdultContent: boolean; signal?: AbortSignal },
): Promise<CollectionRevisionDTO> {
  const res = await gql.fetch<{
    collectionRevision: CollectionRevisionDTO | null;
  }>({
    query: GQL_COLLECTION_REVISION_MODS,
    variables: {
      revisionId: args.revisionId,
      viewAdultContent: args.viewAdultContent,
    },
  });
  if (!res.ok) {
    throw new Error(`GraphQL HTTP ${res.status}`);
  }
  const env = res.body as GqlEnvelope<{
    collectionRevision: CollectionRevisionDTO | null;
  }>;
  if (env.errors && env.errors.length > 0) {
    throw new Error(`GraphQL error: ${env.errors.map((e) => e.message).join("; ")}`);
  }
  if (!env.data || !env.data.collectionRevision) {
    throw new Error("GraphQL: no collectionRevision in response");
  }
  return env.data.collectionRevision;
}

export async function fetchCollectionBySlug(
  gql: GraphQLClient,
  args: { slug: string; gameDomain: string; viewAdultContent: boolean },
): Promise<CollectionBySlugNode | null> {
  const res = await gql.fetch<{ collections: { nodes: CollectionBySlugNode[] } }>({
    query: GQL_COLLECTION_BY_SLUG,
    variables: {
      slug: args.slug,
      gameDomain: args.gameDomain,
      viewAdultContent: args.viewAdultContent,
    },
  });
  if (!res.ok) {
    throw new Error(`GraphQL HTTP ${res.status}`);
  }
  const env = res.body as GqlEnvelope<{
    collections: { nodes: CollectionBySlugNode[] };
  }>;
  if (env.errors && env.errors.length > 0) {
    throw new Error(`GraphQL error: ${env.errors.map((e) => e.message).join("; ")}`);
  }
  if (!env.data) return null;
  return env.data.collections.nodes[0] ?? null;
}
