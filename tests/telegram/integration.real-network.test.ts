import { describe, expect, it } from "vitest";
import { fetchTelegramSources } from "../../src/telegram/index.js";

const SOURCES = ["https://t.me/cookiesreads", "https://t.me/web3list"];

describe("telegram real-network integration", () => {
  it("fetches normalized records and keeps url/content constraints", async () => {
    const result = await fetchTelegramSources(SOURCES, {
      windowHours: 24,
      retryCount: 1,
      maxMessagesPerSource: 40,
      timeoutMs: 20000,
    });

    expect(result.records.length + result.failures.length).toBeGreaterThan(0);

    for (const record of result.records) {
      expect(record.source_type).toBe("telegram");
      expect(record.url.startsWith("https://t.me/")).toBe(false);
      expect(record.content.length).toBeGreaterThanOrEqual(80);
      expect(record.published_at).toMatch(/T/);
      expect(record.fetched_at).toMatch(/T/);
    }

    if (result.records.length === 0) {
      expect(result.failures.length).toBeGreaterThan(0);
    }
  });
});
