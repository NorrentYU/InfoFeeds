import { describe, expect, it } from "vitest";
import { renderDigestMarkdown } from "../../src/aggregate/compose.js";

describe("aggregate compose", () => {
  it("renders fixed section order", () => {
    const markdown = renderDigestMarkdown({
      now: new Date("2026-03-06T01:00:00.000Z"),
      items: [
        {
          source_type: "x",
          source_name: "for_you",
          title: "",
          summary: "**X标题**\n\nX内容",
          url: "https://x.com/a/status/1",
          published_at: "2026-03-06T01:00:00.000Z",
          canonical_url: "https://x.com/a/status/1",
        },
        {
          source_type: "telegram",
          source_name: "cookiesreads",
          title: "t",
          summary: "**TG标题**\n\nTG内容",
          url: "https://example.com/tg",
          published_at: "2026-03-06T01:00:00.000Z",
          canonical_url: "https://example.com/tg",
        },
      ],
    });

    const idxTitle = markdown.indexOf("# 信息集会");
    const idxTelegram = markdown.indexOf("## Telegram");
    const idxX = markdown.indexOf("## X");
    const idxSubstack = markdown.indexOf("## Substack");
    const idxYoutube = markdown.indexOf("## Youtube");
    const idxOthers = markdown.indexOf("## 其他");

    expect(idxTitle).toBeGreaterThanOrEqual(0);
    expect(idxTelegram).toBeGreaterThan(idxTitle);
    expect(idxTelegram).toBeGreaterThanOrEqual(0);
    expect(idxX).toBeGreaterThan(idxTelegram);
    expect(idxSubstack).toBeGreaterThan(idxX);
    expect(idxYoutube).toBeGreaterThan(idxSubstack);
    expect(idxOthers).toBeGreaterThan(idxYoutube);
    expect(markdown.includes("原链接：https://x.com/a/status/1")).toBe(true);
  });

  it("renders fallback link text when url is empty", () => {
    const markdown = renderDigestMarkdown({
      now: new Date("2026-03-06T01:00:00.000Z"),
      items: [
        {
          source_type: "telegram",
          source_name: "cookiesreads",
          title: "t",
          summary: "**TG标题**\n\nTG内容",
          url: "",
          published_at: "2026-03-06T01:00:00.000Z",
          canonical_url: "nourl://telegram/cookiesreads/1",
        },
      ],
    });

    expect(markdown.includes("原链接：N/A（无外链）")).toBe(true);
  });
});
