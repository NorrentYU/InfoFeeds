import { describe, expect, it } from "vitest";
import { parseChannelMessagesFromHtml } from "../../src/telegram/fetcher.js";

const html = `
<div class="tgme_widget_message_wrap">
  <a class="tgme_widget_message_date" href="https://t.me/cookiesreads/100"></a>
  <time datetime="2026-03-05T06:10:00+00:00"></time>
  <div class="tgme_widget_message_text">
    New article <a href="https://example.com/post?utm_source=tg">read</a>
    <a href="https://t.me/another/1">tg link</a>
  </div>
</div>
<div class="tgme_widget_message_wrap">
  <a class="tgme_widget_message_date" href="https://t.me/cookiesreads/99"></a>
  <time datetime="2026-03-01T06:10:00+00:00"></time>
  <div class="tgme_widget_message_text">
    old post <a href="https://example.com/old">old</a>
  </div>
</div>
`;

describe("parseChannelMessagesFromHtml", () => {
  it("keeps only messages inside window and external links", () => {
    const messages = parseChannelMessagesFromHtml({
      sourceUrl: "https://t.me/cookiesreads",
      sourceName: "cookiesreads",
      html,
      now: new Date("2026-03-05T08:00:00+00:00"),
      windowHours: 24,
      maxMessagesPerSource: 10
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]?.messageUrl).toBe("https://t.me/cookiesreads/100");
    expect(messages[0]?.externalLinks).toEqual(["https://example.com/post"]);
  });
});
