import { describe, expect, it } from "vitest";
import { fetchSubstackSources } from "../../src/substack/index.js";

const SOURCES = [
  "https://www.systematiclongshort.com/",
  "https://www.astralcodexten.com/",
];

describe("substack real-network integration", () => {
  it("fetches normalized records from rss feeds", async () => {
    const result = await fetchSubstackSources(SOURCES, {
      windowHours: 24,
      retryCount: 1,
      timeoutMs: 20000,
      maxItemsPerSource: 80,
    });

    expect(result.records.length + result.failures.length).toBeGreaterThan(0);

    for (const record of result.records) {
      expect(record.source_type).toBe("substack");
      expect(record.url.includes("/feed")).toBe(false);
      expect(record.url.startsWith("http")).toBe(true);
      expect(record.content.length).toBeGreaterThanOrEqual(140);
      expect(record.published_at).toMatch(/T/);
      expect(record.fetched_at).toMatch(/T/);
    }

    for (const source of SOURCES) {
      const hostname = new URL(source).hostname.replace(/^www\./, "");
      const hasRecord = result.records.some((record) => record.source_name === hostname);
      const hasNoUpdates = result.failures.some(
        (failure) =>
          failure.source_name === hostname && failure.failure_type === "no_updates",
      );
      const hasDiagnosedFailure = result.failures.some(
        (failure) => failure.source_name === hostname,
      );

      expect(hasRecord || hasNoUpdates || hasDiagnosedFailure).toBe(true);
    }
  });
});
