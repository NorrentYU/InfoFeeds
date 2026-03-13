import { describe, expect, it, vi } from "vitest";
import { XBrowserError } from "../../src/x/browser.js";
import { fetchXForYou } from "../../src/x/index.js";

describe("x fetcher orchestrator", () => {
  it("prefers external article content over original tweet text when available", async () => {
    const result = await fetchXForYou(
      {
        mode: "test",
        now: new Date("2026-03-06T00:00:00.000Z"),
        preferCdp: true,
      },
      {
        scrapeForYouViaCdp: vi.fn().mockResolvedValue({
          stream: "for_you",
          authMethod: "cdp",
          cards: [
            {
              text: "short tweet wrapper",
              statusUrl: "/alice/status/1001",
              publishedAt: "2026-03-05T10:00:00.000Z",
              externalLinks: ["https://t.co/abc"],
            },
          ],
          attempt: 1,
        }),
        scrapeForYouTimeline: vi.fn(),
        fetchArticleFromLinks: vi.fn().mockResolvedValue({
          title: "Article Title",
          content:
            "This is article content that should be preferred over the wrapping tweet content because it is the primary source.",
          url: "https://example.com/article",
        }),
      },
    );

    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.title).toBe("Article Title");
    expect(result.records[0]?.url).toBe("https://example.com/article");
    expect(result.records[0]?.content).toContain("This is article content");
  });

  it("falls back to card preview text when article link cannot be fetched", async () => {
    const cardPreview =
      "Oracle and OpenAI will not expand their data center footprint at their Abilene campus. " +
      "Bloomberg also reported the talks ending, while Nvidia is helping lease remaining capacity to Meta. ".repeat(
        2,
      );

    const result = await fetchXForYou(
      {
        mode: "test",
        now: new Date("2026-03-06T00:00:00.000Z"),
        preferCdp: true,
      },
      {
        scrapeForYouViaCdp: vi.fn().mockResolvedValue({
          stream: "for_you",
          authMethod: "cdp",
          cards: [
            {
              text: "short wrapper tweet",
              statusUrl: "/jukan05/status/2030136213307539517",
              publishedAt: "2026-03-07T04:19:26.000Z",
              externalLinks: ["https://t.co/failure"],
              cardText: cardPreview,
            },
          ],
          attempt: 1,
        }),
        scrapeForYouTimeline: vi.fn(),
        fetchArticleFromLinks: vi.fn().mockResolvedValue(null),
      },
    );

    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.content).toContain(
      "Oracle and OpenAI will not expand their data center footprint",
    );
    expect(result.records[0]?.content).not.toContain("short wrapper tweet");
    expect((result.records[0]?.title || "").length).toBeGreaterThan(0);
  });

  it("filters likely promoted ads with non-X landing pages in For You", async () => {
    const result = await fetchXForYou(
      {
        mode: "test",
        now: new Date("2026-03-08T10:37:10.711Z"),
        preferCdp: true,
      },
      {
        scrapeForYouViaCdp: vi.fn().mockResolvedValue({
          stream: "for_you",
          authMethod: "cdp",
          cards: [
            {
              text: "promo wrapper",
              statusUrl: "/adslot/status/9999",
              externalLinks: ["https://podcasts.apple.com/cn/new"],
              cardText:
                "Shop now free shipping add to cart regular price reviews subscribe bundle buy now " +
                "Shop now free shipping add to cart regular price reviews subscribe bundle buy now ".repeat(
                  15,
                ),
            },
          ],
          attempt: 1,
        }),
        scrapeForYouTimeline: vi.fn(),
        fetchArticleFromLinks: vi.fn().mockResolvedValue({
          title: "Apple 播客网页播放器",
          content:
            "Shop now free shipping add to cart regular price reviews subscribe bundle buy now ".repeat(
              20,
            ),
          url: "https://podcasts.apple.com/cn/new",
        }),
      },
    );

    expect(result.records).toHaveLength(0);
    expect(
      result.failures.some(
        (item) =>
          item.failure_type === "invalid_content" &&
          item.detail.includes("疑似广告内容已过滤"),
      ),
    ).toBe(true);
  });

  it("includes quoted tweet text together with the main tweet text", async () => {
    const result = await fetchXForYou(
      {
        mode: "test",
        now: new Date("2026-03-06T00:00:00.000Z"),
        preferCdp: true,
      },
      {
        scrapeForYouViaCdp: vi.fn().mockResolvedValue({
          stream: "for_you",
          authMethod: "cdp",
          cards: [
            {
              text: "Main tweet body",
              quotedText: "Quoted tweet body with important context",
              statusUrl: "/worldmarketsinc/status/2030049390186975671",
              publishedAt: "2026-03-07T04:19:26.000Z",
            },
          ],
          attempt: 1,
        }),
        scrapeForYouTimeline: vi.fn(),
        fetchArticleFromLinks: vi.fn().mockResolvedValue(null),
      },
    );

    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.content).toContain("Main tweet body");
    expect(result.records[0]?.content).toContain(
      "Quoted tweet body with important context",
    );
    expect(result.records[0]?.content).toContain("引用推文");
  });

  it("prefers article content found from quoted tweet links", async () => {
    const result = await fetchXForYou(
      {
        mode: "test",
        now: new Date("2026-03-06T00:00:00.000Z"),
        preferCdp: true,
      },
      {
        scrapeForYouViaCdp: vi.fn().mockResolvedValue({
          stream: "for_you",
          authMethod: "cdp",
          cards: [
            {
              text: "Wrapper tweet text",
              quotedText: "Quoted preview text",
              quotedExternalLinks: ["https://example.com/deep-article"],
              statusUrl: "/elonmusk/status/2030159267689632121",
              publishedAt: "2026-03-07T04:19:26.000Z",
            },
          ],
          attempt: 1,
        }),
        scrapeForYouTimeline: vi.fn(),
        fetchArticleFromLinks: vi.fn().mockResolvedValue({
          title: "Deep Article",
          content:
            "This is full article content discovered from the quoted tweet card links and should override wrapper text.",
          url: "https://example.com/deep-article",
        }),
      },
    );

    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.url).toBe("https://example.com/deep-article");
    expect(result.records[0]?.title).toBe("Deep Article");
    expect(result.records[0]?.content).toContain(
      "full article content discovered from the quoted tweet card links",
    );
  });

  it("infers quoted tweet text from card preview when quotedText is missing", async () => {
    const result = await fetchXForYou(
      {
        mode: "test",
        now: new Date("2026-03-06T00:00:00.000Z"),
        preferCdp: true,
      },
      {
        scrapeForYouViaCdp: vi.fn().mockResolvedValue({
          stream: "for_you",
          authMethod: "cdp",
          cards: [
            {
              text: "When you're on World, open Inspect -> Network.",
              cardText:
                "When you're on World, open Inspect -> Network. MegaETH powers extreme apps what do I mean by extreme? - extremely onchain - extremely fun",
              statusUrl: "/worldmarketsinc/status/2030049390186975671",
              publishedAt: "2026-03-07T04:19:26.000Z",
            },
          ],
          attempt: 1,
        }),
        scrapeForYouTimeline: vi.fn(),
        fetchArticleFromLinks: vi.fn().mockResolvedValue(null),
      },
    );

    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.content).toContain(
      "When you're on World, open Inspect -> Network.",
    );
    expect(result.records[0]?.content).toContain("MegaETH powers extreme apps");
    expect(result.records[0]?.content).toContain("引用推文");
  });

  it("rehydrates empty For You tweet text from status page details", async () => {
    const scrapeStatusCardsViaCdp = vi.fn().mockResolvedValue({
      cards: [
        {
          text: "Recovered tweet body from status page that includes enough context for summarization.",
          statusUrl: "/SoskaKyle/status/2030427542880997482",
          publishedAt: "2026-03-08T09:00:00.000Z",
          externalLinks: [],
          cardText:
            "Recovered tweet body from status page that includes enough context for summarization.",
        },
      ],
      attempt: 1,
    });

    const result = await fetchXForYou(
      {
        mode: "test",
        now: new Date("2026-03-08T09:31:28.000Z"),
        preferCdp: true,
      },
      {
        scrapeForYouViaCdp: vi.fn().mockResolvedValue({
          stream: "for_you",
          authMethod: "cdp",
          cards: [
            {
              text: "",
              statusUrl: "https://x.com/SoskaKyle/status/2030427542880997482",
              publishedAt: "2026-03-08T09:00:00.000Z",
            },
          ],
          attempt: 1,
        }),
        scrapeStatusCardsViaCdp,
        scrapeForYouTimeline: vi.fn(),
        fetchArticleFromLinks: vi.fn().mockResolvedValue(null),
      },
    );

    expect(scrapeStatusCardsViaCdp).toHaveBeenCalledTimes(1);
    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.url).toBe(
      "https://x.com/SoskaKyle/status/2030427542880997482",
    );
    expect(result.records[0]?.content).toContain(
      "Recovered tweet body from status page",
    );
    expect(result.failures.some((item) => item.detail === "推文正文为空")).toBe(
      false,
    );
  });

  it("rehydrates URL-only For You tweet text from status page details", async () => {
    const scrapeStatusCardsViaCdp = vi.fn().mockResolvedValue({
      cards: [
        {
          text: "How to Think Like Druckenmiller. Every Lesson, Every Decision Framework, Every Edge.",
          statusUrl: "/GoshawkTrades/status/2030249834943238202",
          publishedAt: "2026-03-07T11:50:55.000Z",
          externalLinks: [],
          cardText:
            "How to Think Like Druckenmiller. Every Lesson, Every Decision Framework, Every Edge.",
        },
      ],
      attempt: 1,
    });

    const result = await fetchXForYou(
      {
        mode: "test",
        now: new Date("2026-03-08T10:04:40.000Z"),
        preferCdp: true,
      },
      {
        scrapeForYouViaCdp: vi.fn().mockResolvedValue({
          stream: "for_you",
          authMethod: "cdp",
          cards: [
            {
              text: "https://t.co/P2UoSPmVaw",
              statusUrl:
                "https://x.com/GoshawkTrades/status/2030249834943238202",
              publishedAt: "2026-03-07T11:50:55.000Z",
              externalLinks: ["https://t.co/P2UoSPmVaw"],
            },
          ],
          attempt: 1,
        }),
        scrapeStatusCardsViaCdp,
        scrapeForYouTimeline: vi.fn(),
        fetchArticleFromLinks: vi.fn().mockResolvedValue(null),
      },
    );

    expect(scrapeStatusCardsViaCdp).toHaveBeenCalledTimes(1);
    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.content).toContain("Druckenmiller");
    expect(result.records[0]?.content).not.toBe("https://t.co/P2UoSPmVaw");
  });

  it("uses oEmbed fallback when status-page rehydration still has empty text", async () => {
    const result = await fetchXForYou(
      {
        mode: "test",
        now: new Date("2026-03-08T09:31:28.000Z"),
        preferCdp: true,
      },
      {
        scrapeForYouViaCdp: vi.fn().mockResolvedValue({
          stream: "for_you",
          authMethod: "cdp",
          cards: [
            {
              text: "",
              statusUrl: "https://x.com/Zephyr_hg/status/2030340979476115547",
              publishedAt: "2026-03-08T09:00:00.000Z",
            },
          ],
          attempt: 1,
        }),
        scrapeStatusCardsViaCdp: vi.fn().mockResolvedValue({
          cards: [],
          attempt: 1,
        }),
        fetchTweetTextFromOEmbed: vi.fn().mockResolvedValue({
          text: "https://example.com/deep-link",
          links: ["https://example.com/deep-link"],
        }),
        fetchArticleFromLinks: vi.fn().mockResolvedValue({
          title: "Recovered From OEmbed Link",
          content:
            "Recovered long article body from oEmbed-exposed link and used as final tweet content.",
          url: "https://example.com/deep-link",
        }),
        scrapeForYouTimeline: vi.fn(),
      },
    );

    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.url).toBe("https://example.com/deep-link");
    expect(result.records[0]?.content).toContain(
      "Recovered long article body from oEmbed-exposed link",
    );
    expect(result.failures.some((item) => item.detail === "推文正文为空")).toBe(
      false,
    );
  });

  it("uses CDP primary path when available", async () => {
    const result = await fetchXForYou(
      {
        mode: "test",
        now: new Date("2026-03-06T00:00:00.000Z"),
        preferCdp: true,
      },
      {
        scrapeForYouViaCdp: vi.fn().mockResolvedValue({
          stream: "for_you",
          authMethod: "cdp",
          cards: [
            {
              text: "CDP tweet 1",
              statusUrl: "/alice/status/1001",
              publishedAt: "2026-03-05T10:00:00.000Z",
            },
            {
              text: "CDP tweet 2",
              statusUrl: "https://twitter.com/bob/status/2002",
              publishedAt: "2026-03-05T11:00:00.000Z",
            },
          ],
          attempt: 1,
        }),
        scrapeForYouTimeline: vi.fn(),
      },
    );

    expect(result.records).toHaveLength(2);
    expect(result.failures).toHaveLength(0);
    expect(result.records[0]?.url).toBe("https://x.com/alice/status/1001");
    expect(result.records[1]?.url).toBe("https://x.com/bob/status/2002");
  });

  it("falls back to profile path when CDP is unavailable", async () => {
    const result = await fetchXForYou(
      {
        mode: "test",
        now: new Date("2026-03-06T00:00:00.000Z"),
        credentials: { username: "u", password: "p" },
      },
      {
        scrapeForYouViaCdp: vi.fn().mockRejectedValue(
          new XBrowserError("ECONNREFUSED 127.0.0.1:9222", {
            failureType: "cdp_unavailable",
            retryable: false,
            attempt: 1,
          }),
        ),
        scrapeForYouTimeline: vi.fn().mockResolvedValue({
          stream: "for_you",
          authMethod: "session_reused",
          cards: [
            {
              text: "fallback tweet",
              statusUrl: "/fallback/status/3003",
              publishedAt: "2026-03-05T12:00:00.000Z",
            },
          ],
          attempt: 1,
        }),
      },
    );

    expect(result.records).toHaveLength(1);
    expect(result.failures).toHaveLength(0);
  });

  it("returns explicit cdp_unavailable when fallback is disabled", async () => {
    const result = await fetchXForYou(
      {
        mode: "test",
        preferCdp: true,
        allowFallbackAfterCdpFailure: false,
      },
      {
        scrapeForYouViaCdp: vi.fn().mockRejectedValue(
          new XBrowserError("ECONNREFUSED", {
            failureType: "cdp_unavailable",
            retryable: false,
            attempt: 1,
          }),
        ),
        scrapeForYouTimeline: vi.fn(),
      },
    );

    expect(result.records).toHaveLength(0);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.failure_type).toBe("cdp_unavailable");
  });

  it("returns cdp and fallback failures when both paths fail", async () => {
    const result = await fetchXForYou(
      {
        mode: "test",
        credentials: { username: "u", password: "p" },
      },
      {
        scrapeForYouViaCdp: vi.fn().mockRejectedValue(
          new XBrowserError("CDP not logged in", {
            failureType: "cdp_not_logged_in",
            retryable: false,
            attempt: 1,
          }),
        ),
        scrapeForYouTimeline: vi.fn().mockRejectedValue(
          new XBrowserError("challenge", {
            failureType: "login_challenge",
            retryable: false,
            attempt: 1,
          }),
        ),
      },
    );

    expect(result.records).toHaveLength(0);
    expect(result.failures).toHaveLength(2);
    expect(result.failures[0]?.failure_type).toBe("cdp_not_logged_in");
    expect(result.failures[1]?.failure_type).toBe("login_challenge");
  });

  it("supports profile session reuse without password credentials", async () => {
    const result = await fetchXForYou(
      {
        mode: "test",
        preferCdp: false,
        allowPasswordLogin: false,
        allowManualTakeover: false,
      },
      {
        scrapeForYouViaCdp: vi.fn(),
        scrapeForYouTimeline: vi.fn().mockResolvedValue({
          stream: "for_you",
          authMethod: "session_reused",
          cards: [
            {
              text: "Session reused tweet",
              statusUrl: "/session/status/777",
              publishedAt: "2026-03-06T00:00:00.000Z",
            },
          ],
          attempt: 1,
        }),
        loadXCredentials: vi.fn().mockResolvedValue(null),
      },
    );

    expect(result.records).toHaveLength(1);
    expect(result.failures).toHaveLength(0);
  });

  it("returns stale_feed when freshness retries are exhausted", async () => {
    const result = await fetchXForYou(
      {
        mode: "test",
        credentials: { username: "u", password: "p" },
      },
      {
        scrapeForYouViaCdp: vi.fn().mockRejectedValue(
          new XBrowserError("CDP not logged in", {
            failureType: "cdp_not_logged_in",
            retryable: false,
            attempt: 1,
          }),
        ),
        scrapeForYouTimeline: vi.fn().mockRejectedValue(
          new XBrowserError("stale", {
            failureType: "stale_feed",
            retryable: false,
            attempt: 1,
          }),
        ),
      },
    );

    expect(result.records).toHaveLength(0);
    expect(result.failures[result.failures.length - 1]?.failure_type).toBe(
      "stale_feed",
    );
  });

  it("appends x_content records from handed-off status urls", async () => {
    const result = await fetchXForYou(
      {
        mode: "test",
        contentUrls: ["https://x.com/bob/status/2002?utm_source=tg"],
      },
      {
        scrapeForYouViaCdp: vi.fn().mockResolvedValue({
          stream: "for_you",
          authMethod: "cdp",
          cards: [
            {
              text: "For You tweet",
              statusUrl: "/alice/status/1001",
              publishedAt: "2026-03-05T10:00:00.000Z",
            },
          ],
          attempt: 1,
        }),
        scrapeStatusCardsViaCdp: vi.fn().mockResolvedValue({
          cards: [
            {
              text: "Handed off tweet body with enough details and context",
              statusUrl: "/bob/status/2002",
              publishedAt: "2026-03-05T11:00:00.000Z",
              externalLinks: [],
              cardText: "",
            },
          ],
          attempt: 1,
        }),
        scrapeForYouTimeline: vi.fn(),
        fetchArticleFromLinks: vi.fn().mockResolvedValue(null),
      },
    );

    expect(result.records).toHaveLength(2);
    expect(result.records.some((item) => item.source_name === "for_you")).toBe(
      true,
    );
    expect(
      result.records.some(
        (item) =>
          item.source_name === "x_content" &&
          item.url === "https://x.com/bob/status/2002",
      ),
    ).toBe(true);
  });

  it("records x_content failure without breaking For You output", async () => {
    const result = await fetchXForYou(
      {
        mode: "test",
        contentUrls: ["https://x.com/bob/status/2002"],
      },
      {
        scrapeForYouViaCdp: vi.fn().mockResolvedValue({
          stream: "for_you",
          authMethod: "cdp",
          cards: [
            {
              text: "For You tweet",
              statusUrl: "/alice/status/1001",
              publishedAt: "2026-03-05T10:00:00.000Z",
            },
          ],
          attempt: 1,
        }),
        scrapeStatusCardsViaCdp: vi.fn().mockRejectedValue(
          new XBrowserError("cdp unavailable", {
            failureType: "cdp_unavailable",
            retryable: false,
            attempt: 1,
          }),
        ),
        scrapeForYouTimeline: vi.fn(),
        fetchArticleFromLinks: vi.fn().mockResolvedValue(null),
      },
    );

    expect(result.records.length).toBeGreaterThanOrEqual(1);
    expect(
      result.failures.some(
        (item) =>
          item.source_name === "x_content" &&
          item.failure_type === "cdp_unavailable",
      ),
    ).toBe(true);
  });
});
