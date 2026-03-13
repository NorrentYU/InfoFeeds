import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchTelegramSources } from "../../src/telegram/index.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("telegram x-content handoff", () => {
  it("hands off x links to x module and does not store them as telegram records", async () => {
    const feedHtml = `
      <div class="tgme_widget_message_wrap">
        <a class="tgme_widget_message_date" href="https://t.me/cookiesreads/101"></a>
        <time datetime="2026-03-08T08:00:00+00:00"></time>
        <div class="tgme_widget_message_text">
          see this
          <a href="https://x.com/abc/status/1234567890?utm_source=tg">x link</a>
        </div>
      </div>
    `;

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "https://t.me/s/cookiesreads") {
        return new Response(feedHtml, { status: 200 });
      }
      throw new Error(`Unexpected fetch url: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchTelegramSources(["https://t.me/cookiesreads"], {
      now: new Date("2026-03-08T09:00:00.000Z"),
      windowHours: 24,
      retryCount: 0,
    });

    expect(result.records).toHaveLength(0);
    expect(result.x_content_handoffs).toHaveLength(1);
    expect(result.x_content_handoffs[0]?.x_url).toBe(
      "https://x.com/abc/status/1234567890",
    );
    expect(
      result.failures.some((item) => item.failure_type === "x_content"),
    ).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
