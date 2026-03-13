import { describe, expect, it } from "vitest";
import { canonicalizeUrl } from "../../src/aggregate/url.js";

describe("aggregate canonical url", () => {
  it("normalizes host, trailing slash and tracking params", () => {
    expect(
      canonicalizeUrl("https://WWW.Example.com/a/b/?utm_source=tg&id=1#x"),
    ).toBe("https://example.com/a/b?id=1");
  });

  it("returns null for invalid url", () => {
    expect(canonicalizeUrl("not-a-url")).toBeNull();
  });
});
