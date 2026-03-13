import { describe, expect, it } from "vitest";
import { fetchYoutubeSources } from "../../src/youtube/index.js";

const SOURCES = [
  "https://www.youtube.com/@PeterYangYT",
  "https://www.youtube.com/@Messari",
];

describe("youtube real-network integration", () => {
  it("fetches latest video transcript for each source", async () => {
    const result = await fetchYoutubeSources(SOURCES, {
      latestOnly: true,
      retryCount: 1,
      timeoutMs: 30000,
      maxVideosPerSource: 2,
    });

    expect(result.records.length + result.failures.length).toBeGreaterThanOrEqual(2);

    for (const record of result.records) {
      expect(record.source_type).toBe("youtube");
      expect(record.url).toContain("watch?v=");
      expect(record.content.length).toBeGreaterThanOrEqual(80);
      expect(record.published_at).toMatch(/T/);
      expect(record.fetched_at).toMatch(/T/);
    }

    for (const source of SOURCES) {
      const sourceName = new URL(source).pathname.replace(/^\/@/, "");
      const hasRecord = result.records.some((record) => record.source_name === sourceName);
      const hasFailure = result.failures.some((failure) => failure.source_name === sourceName);
      expect(hasRecord || hasFailure).toBe(true);
    }
  });
});
