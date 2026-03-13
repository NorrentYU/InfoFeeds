import { describe, expect, it } from "vitest";
import { fetchOthersSources } from "../../src/others/index.js";
import { sourceNameFromUrl } from "../../src/others/url.js";

const SOURCES = [
  "https://every.to/chain-of-thought/",
  "https://every.to/napkin-math/",
];

describe("others real-network integration", () => {
  it("fetches latest 2 records for each source", async () => {
    const result = await fetchOthersSources(SOURCES, {
      latestCountPerSource: 2,
      retryCount: 1,
      timeoutMs: 20000,
      maxItemsPerSource: 80,
    });

    expect(result.records.length + result.failures.length).toBeGreaterThan(0);

    for (const record of result.records) {
      expect(record.source_type).toBe("others");
      expect(record.url.includes("/feed")).toBe(false);
      expect(record.url.startsWith("http")).toBe(true);
      expect(record.content.length).toBeGreaterThanOrEqual(140);
      expect(record.published_at).toMatch(/T/);
      expect(record.fetched_at).toMatch(/T/);
    }

    for (const source of SOURCES) {
      const sourceName = sourceNameFromUrl(source);
      const sourceRecords = result.records.filter(
        (record) => record.source_name === sourceName,
      );
      expect(sourceRecords.length).toBe(2);
    }
  });
});
