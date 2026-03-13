import { describe, expect, it } from "vitest";
import {
  buildFeedUrl,
  isFeedUrl,
  normalizeArticleUrl,
  normalizeSourceUrl,
  sourceNameFromUrl,
} from "../../src/substack/url.js";

describe("substack url helpers", () => {
  it("normalizes source url and source name", () => {
    expect(normalizeSourceUrl("www.systematiclongshort.com")).toBe(
      "https://www.systematiclongshort.com/",
    );
    expect(sourceNameFromUrl("https://www.astralcodexten.com/")).toBe(
      "astralcodexten.com",
    );
  });

  it("builds feed url", () => {
    expect(buildFeedUrl("https://www.systematiclongshort.com/")).toBe(
      "https://www.systematiclongshort.com/feed",
    );
    expect(buildFeedUrl("https://www.systematiclongshort.com/feed")).toBe(
      "https://www.systematiclongshort.com/feed",
    );
  });

  it("normalizes article links and drops tracking params", () => {
    expect(
      normalizeArticleUrl(
        "https://example.substack.com/p/test?utm_source=tg&id=1#abc",
      ),
    ).toBe("https://example.substack.com/p/test?id=1");
  });

  it("detects feed url", () => {
    expect(isFeedUrl("https://x.substack.com/feed")).toBe(true);
    expect(isFeedUrl("https://x.substack.com/p/article")).toBe(false);
  });
});
