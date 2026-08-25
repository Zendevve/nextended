import { describe, expect, it } from "vitest";
import {
  NXM_URL_RE,
  PAGE_REGEX_URL_PATTERNS,
  SITE_ADAPTER_VERSION,
  parseRoute,
  isExcludedPath,
} from "@core/siteAdapters";

describe("parseRoute", () => {
  it("classifies a collection page", () => {
    const ctx = parseRoute(
      "https://www.nexusmods.com/games/skyrimspecialedition/collections/cool-modlist",
    );
    expect(ctx.kind).toBe("collection");
    if (ctx.kind === "collection") {
      expect(ctx.gameDomain).toBe("skyrimspecialedition");
      expect(ctx.slug).toBe("cool-modlist");
      expect(ctx.revision).toBeNull();
    }
  });

  it("captures collection revision", () => {
    const ctx = parseRoute(
      "https://www.nexusmods.com/games/skyrim/collections/x/revisions/7",
    );
    expect(ctx.kind).toBe("collection");
    if (ctx.kind === "collection") expect(ctx.revision).toBe(7);
  });

  it("classifies archived mod page", () => {
    const ctx = parseRoute(
      "https://www.nexusmods.com/skyrim/mods/12345?tab=files&category=archived",
    );
    expect(ctx.kind).toBe("archived");
  });

  it("classifies regular mod page with file_id", () => {
    const ctx = parseRoute(
      "https://www.nexusmods.com/skyrim/mods/12345?tab=files&file_id=67890",
    );
    expect(ctx.kind).toBe("mod");
    if (ctx.kind === "mod") {
      expect(ctx.modId).toBe("12345");
      expect(ctx.fileId).toBe("67890");
    }
  });

  it("returns other on a non-nexus host", () => {
    expect(parseRoute("https://example.com/foo").kind).toBe("other");
  });

  it("returns other for unrecognised path", () => {
    expect(parseRoute("https://www.nexusmods.com/").kind).toBe("other");
  });

  it("survives invalid input", () => {
    expect(parseRoute("not a url").kind).toBe("other");
  });
});

describe("isExcludedPath", () => {
  it("excludes search results", () => {
    expect(isExcludedPath("https://www.nexusmods.com/search/?q=x")).toBe(true);
  });
  it("excludes forum", () => {
    expect(isExcludedPath("https://www.nexusmods.com/forum/some-thread")).toBe(true);
  });
  it("excludes paginated views", () => {
    expect(isExcludedPath("https://www.nexusmods.com/skyrim/mods/1?page=2")).toBe(true);
  });
  it("does not exclude mod file pages", () => {
    expect(isExcludedPath("https://www.nexusmods.com/skyrim/mods/1?tab=files&file_id=2")).toBe(false);
  });
});

describe("NXM_URL_RE", () => {
  it("accepts canonical nxm://game/mods/.../files/...", () => {
    expect(
      NXM_URL_RE.test(
        "nxm://skyrimspecialedition/mods/12345/files/67890?key=abc&expires=1&user_id=1",
      ),
    ).toBe(true);
  });
  it("rejects non-nxm URLs", () => {
    expect(NXM_URL_RE.test("https://example.com")).toBe(false);
  });
});

describe("PAGE_REGEX_URL_PATTERNS", () => {
  it("matches a nexus-cdn .zip URL", () => {
    const html = `<a href="https://cdn.nexus-cdn.com/foo/Skyrim-Mod-1.zip?md5=abc">x</a>`;
    const hit = PAGE_REGEX_URL_PATTERNS.some((re) => re.test(html));
    expect(hit).toBe(true);
  });
});

describe("SITE_ADAPTER_VERSION", () => {
  it("is a non-empty string", () => {
    expect(SITE_ADAPTER_VERSION.length).toBeGreaterThan(0);
  });
});
