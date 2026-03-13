import { describe, expect, it } from "vitest";
import { parseFeedXml } from "../../src/substack/rss.js";

describe("substack rss parser", () => {
  it("extracts content with priority content:encoded > description", () => {
    const xml = `<?xml version="1.0"?>
    <rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
      <channel>
        <item>
          <guid>g-1</guid>
          <title>Post A</title>
          <link>https://sample.substack.com/p/post-a?utm_source=tg</link>
          <pubDate>Thu, 05 Mar 2026 00:00:00 GMT</pubDate>
          <description><![CDATA[<p>description text</p>]]></description>
          <content:encoded><![CDATA[<p>encoded text preferred</p>]]></content:encoded>
        </item>
      </channel>
    </rss>`;

    const parsed = parseFeedXml({
      sourceUrl: "https://sample.substack.com/",
      feedUrl: "https://sample.substack.com/feed",
      xml,
      maxItems: 10,
    });

    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0]?.guid).toBe("g-1");
    expect(parsed.entries[0]?.link).toBe("https://sample.substack.com/p/post-a");
    expect(parsed.entries[0]?.content).toContain("encoded text preferred");
  });

  it("returns parse failures for broken entries", () => {
    const xml = `<?xml version="1.0"?><rss><channel><item><title>No Link</title></item></channel></rss>`;

    const parsed = parseFeedXml({
      sourceUrl: "https://sample.substack.com/",
      feedUrl: "https://sample.substack.com/feed",
      xml,
      maxItems: 10,
    });

    expect(parsed.entries).toHaveLength(0);
    expect(parsed.failures.length).toBeGreaterThan(0);
  });
});
