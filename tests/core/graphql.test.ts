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
          body: { data: { collection: { id: "1", name: "test", slug: "test", latestPublishedRevision: null } } },
          headers: {},
        };
      },
    };
    const gql = makeGraphQL(client);
    await fetchCollectionBySlug(gql, {
      slug: "x",
      domainName: "skyrim",
      viewAdultContent: true,
    });
    expect(capturedUrl).toContain("api.nexusmods.com/v2/graphql");
    expect(capturedBody).toContain("CollectionBySlug");
    expect(capturedBody).toContain("viewAdultContent");
  });

  it("throws on non-2xx", async () => {
    const gql = makeGraphQL(jsonClient({}, 500));
    await expect(
      fetchCollectionRevisionMods(gql, {
        slug: "cool-list",
        domainName: "skyrim",
        revision: 1,
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
        slug: "cool-list",
        domainName: "skyrim",
        revision: 1,
        viewAdultContent: true,
      }),
    ).rejects.toThrow(/boom/);
  });

  it("normalises a real-shaped revision response", async () => {
    const response = {
      data: {
        collectionRevision: {
          id: 1,
          revisionNumber: 1,
          collection: {
            id: 1,
            name: "Cool list",
            slug: "cool-list",
            game: { id: 110, domainName: "skyrim" },
          },
          modFiles: [
            {
              optional: false,
              fileId: 100,
              file: {
                name: "file.zip",
                sizeInBytes: "4194304",
                uri: "/files/file.zip",
                mod: {
                  id: "1",
                  name: "Mod 1",
                },
              },
            },
          ],
        },
      },
    };
    const gql = makeGraphQL(jsonClient(response));
    const out = await fetchCollectionRevisionMods(gql, {
      slug: "cool-list",
      domainName: "skyrim",
      revision: 1,
      viewAdultContent: true,
    });
    expect(out.collection.slug).toBe("cool-list");
    expect(out.modFiles).toHaveLength(1);
    expect(out.modFiles[0]?.file.name).toBe("file.zip");
  });
});
