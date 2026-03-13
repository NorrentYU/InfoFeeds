import { describe, expect, it } from "vitest";
import {
  buildFeedUrl,
  isFeedUrl,
  normalizeArticleUrl,
  normalizeSourceUrl,
  sourceNameFromUrl,
} from "../../src/others/url.js";

describe("others url helpers", () => {
  it("normalizes source url and source name", () => {
    expect(normalizeSourceUrl("every.to/chain-of-thought/")).toBe(
      "https://every.to/chain-of-thought",
    );
    expect(sourceNameFromUrl("https://every.to/napkin-math/")).toBe(
      "every.to/napkin-math",
    );
  });

  it("builds feed url", () => {
    expect(buildFeedUrl("https://every.to/chain-of-thought/")).toBe(
      "https://every.to/chain-of-thought/feed",
    );
    expect(buildFeedUrl("https://every.to/chain-of-thought/feed")).toBe(
      "https://every.to/chain-of-thought/feed",
    );
  });

  it("normalizes article links and drops tracking params", () => {
    expect(
      normalizeArticleUrl(
        "https://every.to/chain-of-thought/p/test?utm_source=tg&id=1#abc",
      ),
    ).toBe("https://every.to/chain-of-thought/p/test?id=1");
  });

  it("detects feed url", () => {
    expect(isFeedUrl("https://every.to/chain-of-thought/feed")).toBe(true);
    expect(isFeedUrl("https://every.to/chain-of-thought/p/article")).toBe(false);
  });
});
