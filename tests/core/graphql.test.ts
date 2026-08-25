import { describe, expect, it } from "vitest";
import {
  makeGraphQL,
  fetchCollectionBySlug,
  fetchCollectionRevisionMods,
  type HttpClient,
  type HttpResponse,
} from "@core/graphql";

function jsonClient(body: unknown, status = 200): HttpClient {
  return {
    async fetch(): Promise<HttpResponse> {
      return { status, ok: status < 300, body, headers: { "content-type": "application/json" } };
    },
  };
}

describe("GraphQL client", () => {
  it("posts JSON with credentials and parses an envelope", async () => {
    let capturedUrl = "";
    let capturedBody = "";
    const client: HttpClient = {
      async fetch(input) {
        capturedUrl = input.url;
        capturedBody = input.body ?? "";
        return {
          status: 200,
          ok: true,
          body: { data: { collections: { nodes: [] } } },
          headers: {},
        };
      },
    };
    const gql = makeGraphQL(client);
    await fetchCollectionBySlug(gql, {
      slug: "x",
      gameDomain: "skyrim",
      viewAdultContent: true,
    });
    expect(capturedUrl).toContain("/api/graphql");
    expect(capturedBody).toContain("CollectionBySlug");
    expect(capturedBody).toContain("viewAdultContent");
  });

  it("throws on non-2xx", async () => {
    const gql = makeGraphQL(jsonClient({}, 500));
    await expect(
      fetchCollectionRevisionMods(gql, {
        revisionId: "r1",
        viewAdultContent: true,
      }),
    ).rejects.toThrow(/HTTP 500/);
  });

  it("throws on GraphQL errors", async () => {
    const gql = makeGraphQL(
      jsonClient({ errors: [{ message: "boom" }] }, 200),
    );
    await expect(
      fetchCollectionRevisionMods(gql, {
        revisionId: "r1",
        viewAdultContent: true,
      }),
    ).rejects.toThrow(/boom/);
  });

  it("normalises a real-shaped revision response", async () => {
    const response = {
      data: {
        collectionRevision: {
          id: "rev1",
          collection: {
            id: "c1",
            name: "Cool list",
            slug: "cool-list",
            game: { id: "110", domainName: "skyrim" },
          },
          mods: [
            {
              position: 0,
              optional: false,
              mod: {
                id: "1",
                name: "Mod 1",
                modFiles: [
                  {
                    fileId: "100",
                    name: "file.zip",
                    uri: "/files/file.zip",
                    sizeKB: 4096,
                    version: "1.0",
                  },
                ],
              },
            },
          ],
        },
      },
    };
    const gql = makeGraphQL(jsonClient(response));
    const out = await fetchCollectionRevisionMods(gql, {
      revisionId: "rev1",
      viewAdultContent: true,
    });
    expect(out.collection.slug).toBe("cool-list");
    expect(out.mods).toHaveLength(1);
    expect(out.mods[0]?.mod.modFiles[0]?.sizeKB).toBe(4096);
  });
});
