import { describe, expect, it } from "vitest";
import {
  classify,
  errorClassDisplay,
  isFatal,
} from "@core/errorClassifier";

describe("classify", () => {
  it("returns network on networkError", () => {
    expect(classify({ networkError: true })).toBe("network");
  });

  it("detects login by 401 without CF markers", () => {
    expect(classify({ status: 401, body: "" })).toBe("login");
  });

  it("prefers cloudflare over login when CF markers present", () => {
    expect(
      classify({
        status: 403,
        body: "cf-turnstile wrapper here",
        headers: { "cf-ray": "abc" },
      }),
    ).toBe("cloudflare");
  });

  it("detects 'Just a moment' challenge", () => {
    expect(
      classify({ status: 403, body: "<title>Just a moment...</title>" }),
    ).toBe("cloudflare");
  });

  it("detects suspension notice", () => {
    expect(
      classify({ status: 200, body: "Your account is temporarily suspended." }),
    ).toBe("suspended");
  });

  it("classifies 5xx without markers as network", () => {
    expect(classify({ status: 502, body: "bad gateway" })).toBe("network");
  });

  it("classifies missing body with no status as unresolved when not pure-empty", () => {
    // status=0 + empty body = network per classifier rule
    expect(classify({ status: 0, body: "" })).toBe("network");
    // status=0 + some body = unresolved
    expect(classify({ status: 0, body: "weird" })).toBe("unresolved");
  });
});

describe("isFatal", () => {
  it("treats login, cloudflare, suspended as fatal", () => {
    expect(isFatal("login")).toBe(true);
    expect(isFatal("cloudflare")).toBe(true);
    expect(isFatal("suspended")).toBe(true);
    expect(isFatal("network")).toBe(false);
    expect(isFatal("unresolved")).toBe(false);
  });
});

describe("errorClassDisplay", () => {
  it("returns a useful link for login", () => {
    const d = errorClassDisplay("login");
    expect(d.link).toContain("/users/login");
  });

  it("returns a network message", () => {
    const d = errorClassDisplay("network");
    expect(d.message.toLowerCase()).toContain("network");
  });
});
