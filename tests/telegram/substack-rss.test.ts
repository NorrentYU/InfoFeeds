import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchSubstackArticleFromRss,
  isSubstackArticleUrl,
} from "../../src/telegram/substack-rss.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("substack rss fallback", () => {
  it("detects substack article urls", () => {
    expect(
      isSubstackArticleUrl("https://mhdempsey.substack.com/p/ai-safety-has-12-months-left"),
    ).toBe(true);
    expect(
      isSubstackArticleUrl("https://www.veradiverdict.com/p/2026-the-invisible-revolution"),
    ).toBe(true);
    expect(isSubstackArticleUrl("https://example.com/post/1")).toBe(false);
  });

  it("reads article content from substack feed", async () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <entry>
          <title>AI Safety Has 12 Months Left</title>
          <link rel="alternate" href="https://mhdempsey.substack.com/p/ai-safety-has-12-months-left" />
          <updated>2026-03-05T01:00:00Z</updated>
          <content type="html"><![CDATA[
            <p>This is a long body from RSS. This is a long body from RSS. This is a long body from RSS.</p>
          ]]></content>
        </entry>
      </feed>`;

    const fetchMock = vi.fn(async () => new Response(xml, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const article = await fetchSubstackArticleFromRss(
      "https://mhdempsey.substack.com/p/ai-safety-has-12-months-left?utm_source=tg",
      {
        timeoutMs: 5000,
        retryCount: 0,
        retryDelayMs: 10,
      },
    );

    expect(article).not.toBeNull();
    expect(article?.title).toContain("AI Safety");
    expect(article?.content).toContain("long body from RSS");
    expect(article?.feedUrl).toBe("https://mhdempsey.substack.com/feed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("supports custom-domain substack /p links via feed", async () => {
    const xml = `<?xml version="1.0"?>
      <rss version="2.0">
        <channel>
          <item>
            <title>The Invisible Revolution</title>
            <link>https://www.veradiverdict.com/p/2026-the-invisible-revolution</link>
            <description><![CDATA[
              <p>Custom domain RSS content. Custom domain RSS content. Custom domain RSS content.</p>
            ]]></description>
          </item>
        </channel>
      </rss>`;

    const fetchMock = vi.fn(async () => new Response(xml, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const article = await fetchSubstackArticleFromRss(
      "https://www.veradiverdict.com/p/2026-the-invisible-revolution",
      {
        timeoutMs: 5000,
        retryCount: 0,
        retryDelayMs: 10,
      },
    );

    expect(article).not.toBeNull();
    expect(article?.title).toContain("Invisible Revolution");
    expect(article?.content).toContain("Custom domain RSS content");
    expect(article?.feedUrl).toBe("https://www.veradiverdict.com/feed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
