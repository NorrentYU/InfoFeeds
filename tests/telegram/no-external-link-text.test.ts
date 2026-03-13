import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchTelegramSources } from "../../src/telegram/index.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("text-only telegram message handling", () => {
  it("captures text message without external link and keeps url empty", async () => {
    const longText = "这是一条没有外链但内容完整的频道消息，用于验证降级抓取逻辑。".repeat(6);
    const feedHtml = `
      <div class="tgme_widget_message_wrap">
        <a class="tgme_widget_message_date" href="https://t.me/hyperstiti0ns/999"></a>
        <time datetime="2026-03-05T06:10:00+00:00"></time>
        <div class="tgme_widget_message_text">${longText}</div>
      </div>
    `;

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "https://t.me/s/hyperstiti0ns") {
        return new Response(feedHtml, { status: 200 });
      }
      throw new Error(`Unexpected fetch url: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchTelegramSources(["https://t.me/hyperstiti0ns"], {
      now: new Date("2026-03-05T09:26:34.168Z"),
      windowHours: 24,
      retryCount: 0
    });

    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.source_type).toBe("telegram");
    expect(result.records[0]?.url).toBe("");
    expect(result.records[0]?.content).toContain("没有外链");

    const degraded = result.failures.find(
      (item) => item.failure_type === "no_external_link" && item.detail.includes("降级")
    );
    expect(degraded).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
