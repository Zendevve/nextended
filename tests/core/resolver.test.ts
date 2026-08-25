import { describe, expect, it } from "vitest";
import { resolve, type ResolveInput } from "@core/resolver";
import type { HttpClient, HttpResponse } from "@core/graphql";

type FetchInput = Parameters<HttpClient["fetch"]>[0];
type Responder = (url: string, init: FetchInput) => HttpResponse;

function fakeClient(responder: Responder): HttpClient {
  return {
    async fetch(input) {
      return responder(input.url, input);
    },
  };
}

function jsonRes(
  status: number,
  body: unknown,
  extraHeaders: Record<string, string> = {},
): HttpResponse {
  return {
    status,
    ok: status >= 200 && status < 300,
    body,
    headers: { "content-type": "application/json", ...extraHeaders },
  };
}

function textRes(
  status: number,
  body: string,
  extraHeaders: Record<string, string> = {},
): HttpResponse {
  return { status, ok: status >= 200 && status < 300, body, headers: extraHeaders };
}

function input(over: Partial<ResolveInput> = {}): ResolveInput {
  return {
    gameDomain: "skyrim",
    gameNumericId: 110,
    modId: "12345",
    fileId: "67890",
    ...over,
  };
}

const baseCtx = {
  isNMM: true,
  signal: new AbortController().signal,
};

describe("resolve — strategy chain", () => {
  it("short-circuits on nxm-passthrough", async () => {
    const r = await resolve(
      input({ nxmUrl: "nxm://skyrim/mods/1/files/2?key=k&expires=1&user_id=1" }),
      { ...baseCtx, client: fakeClient(() => jsonRes(200, {})) },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.strategy).toBe("nxm-passthrough");
      expect(r.url).toContain("nxm://");
    }
  });

  it("rejects a non-nxm nxmUrl", async () => {
    const r = await resolve(
      input({ nxmUrl: "https://example.com" }),
      { ...baseCtx, client: fakeClient(() => jsonRes(200, {})) },
    );
    expect(r.ok).toBe(false);
  });

  it("resolves via component-attr when JSON carries secureDownloadUrl", async () => {
    const r = await resolve(
      input({
        componentAttrs: { secureDownloadUrl: "https://cdn.example.com/x.zip" },
      }),
      { ...baseCtx, client: fakeClient(() => jsonRes(200, {})) },
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.strategy).toBe("component-attr");
  });

  it("resolves via component-attr by deep walking the JSON", async () => {
    const r = await resolve(
      input({
        componentAttrs: {
          "MOD-DOWNLOAD-MODAL": {
            nested: { vortexDownloadUrl: "https://cdn.example.com/y.zip" },
          },
        },
      }),
      { ...baseCtx, client: fakeClient(() => jsonRes(200, {})) },
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.url).toBe("https://cdn.example.com/y.zip");
  });

  it("resolves via api-files when it returns a download URL", async () => {
    const r = await resolve(input(), {
      ...baseCtx,
      client: fakeClient((url) => {
        if (url.includes("/api/files")) {
          return jsonRes(200, { downloadUrl: "https://cdn.example.com/api.zip" });
        }
        return jsonRes(404, { error: "missing" });
      }),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.strategy).toBe("api-files");
  });

  it("falls through to page-regex when given modPageHtml", async () => {
    const html = `<a href="https://www.nexus-cdn.com/path/Skyrim.zip?h=abc">x</a>`;
    const r = await resolve(input({ modPageHtml: html }), {
      ...baseCtx,
      client: fakeClient(() => jsonRes(404, {})),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.strategy).toBe("page-regex");
  });

  it("falls through to generate-nmm", async () => {
    const r = await resolve(input(), {
      ...baseCtx,
      client: fakeClient((url, init) => {
        if (url.includes("GenerateDownloadUrl") && init.body?.includes("nmm=1")) {
          return jsonRes(200, { uri: "https://cdn.example.com/nmm.zip" });
        }
        return jsonRes(404, { error: "missing" });
      }),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.strategy).toBe("generate-nmm");
  });
  it("falls through to generate-plain when nmm fails", async () => {
    const r = await resolve(input(), {
      ...baseCtx,
      client: fakeClient((url, init) => {
        if (url.includes("GenerateDownloadUrl")) {
          if (init.body?.includes("nmm=1")) return jsonRes(500, { error: "nope" });
          return jsonRes(200, { uri: "https://cdn.example.com/plain.zip" });
        }
        return jsonRes(404, {});
      }),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.strategy).toBe("generate-plain");
  });
  it("falls through to deep-scrape as last resort", async () => {
    const html = `<a href="https://www.nexus-cdn.com/Mod.zip?h=abc">x</a>`;
    const r = await resolve(input(), {
      ...baseCtx,
      client: fakeClient((url) => {
        if (url.includes("GenerateDownloadUrl")) return jsonRes(500, {});
        if (url.includes("/mods/")) return textRes(200, html);
        return jsonRes(404, {});
      }),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.strategy).toBe("deep-scrape");
  });

  it("returns login when generate-nmm responds 401", async () => {
    const r = await resolve(input(), {
      ...baseCtx,
      client: fakeClient((url) => {
        if (url.includes("GenerateDownloadUrl")) return jsonRes(401, { error: "auth" });
        return jsonRes(404, {});
      }),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("login");
  });

  it("returns unresolved when every strategy fails", async () => {
    const r = await resolve(input(), {
      ...baseCtx,
      client: fakeClient(() => jsonRes(404, {})),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("unresolved");
      expect(r.attempts.length).toBeGreaterThan(0);
    }
  });

  it("respects the abort signal", async () => {
    const ac = new AbortController();
    ac.abort();
    const r = await resolve(input(), {
      ...baseCtx,
      signal: ac.signal,
      client: fakeClient(() => jsonRes(200, {})),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("network");
  });
});
