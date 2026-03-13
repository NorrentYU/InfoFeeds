import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSubstackSources } from "../../src/substack/index.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("substack fetch pipeline", () => {
  it("applies window filter and dedupe (guid first)", async () => {
    const xml = `<?xml version="1.0"?>
      <rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
        <channel>
          <item>
            <guid>dup-guid</guid>
            <title>A</title>
            <link>https://demo.substack.com/p/a</link>
            <pubDate>Thu, 05 Mar 2026 02:00:00 GMT</pubDate>
            <content:encoded><![CDATA[<p>${"valid body ".repeat(40)}</p>]]></content:encoded>
          </item>
          <item>
            <guid>dup-guid</guid>
            <title>A duplicated</title>
            <link>https://demo.substack.com/p/a?utm_source=tg</link>
            <pubDate>Thu, 05 Mar 2026 02:00:00 GMT</pubDate>
            <description><![CDATA[<p>${"valid body ".repeat(40)}</p>]]></description>
          </item>
          <item>
            <guid>old-guid</guid>
            <title>Old</title>
            <link>https://demo.substack.com/p/old</link>
            <pubDate>Mon, 02 Mar 2026 02:00:00 GMT</pubDate>
            <description><![CDATA[<p>${"old body ".repeat(40)}</p>]]></description>
          </item>
        </channel>
      </rss>`;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === "https://demo.substack.com/feed") {
          return new Response(xml, { status: 200 });
        }
        throw new Error(`unexpected url: ${url}`);
      }),
    );

    const result = await fetchSubstackSources(["https://demo.substack.com"], {
      now: new Date("2026-03-05T09:00:00.000Z"),
      windowHours: 24,
      retryCount: 0,
      maxItemsPerSource: 20,
    });

    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.url).toBe("https://demo.substack.com/p/a");
    expect(result.records[0]?.source_type).toBe("substack");
  });

  it("dedupes by link + published_at when guid missing", async () => {
    const xml = `<?xml version="1.0"?>
      <rss version="2.0">
        <channel>
          <item>
            <title>B</title>
            <link>https://demo.substack.com/p/b</link>
            <pubDate>Thu, 05 Mar 2026 02:00:00 GMT</pubDate>
            <description><![CDATA[${"content ".repeat(50)}]]></description>
          </item>
          <item>
            <title>B duplicate</title>
            <link>https://demo.substack.com/p/b</link>
            <pubDate>Thu, 05 Mar 2026 02:00:00 GMT</pubDate>
            <description><![CDATA[${"content ".repeat(50)}]]></description>
          </item>
        </channel>
      </rss>`;

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(xml, { status: 200 })),
    );

    const result = await fetchSubstackSources(["https://demo.substack.com"], {
      now: new Date("2026-03-05T09:00:00.000Z"),
      windowHours: 24,
      retryCount: 0,
    });

    expect(result.records).toHaveLength(1);
  });
});
