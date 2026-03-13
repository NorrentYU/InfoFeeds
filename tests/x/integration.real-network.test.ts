import { describe, expect, it } from "vitest";
import { fetchXForYou } from "../../src/x/index.js";

describe("x real-network integration", () => {
  it("fetches For You top 5 or returns explicit blocking evidence", async () => {
    const result = await fetchXForYou({
      mode: "test",
      retryCount: 1,
      timeoutMs: 45000,
      headless: true,
      allowManualTakeover: false,
    });

    const blocked = result.failures.some((failure) =>
      [
        "cdp_unavailable",
        "cdp_context_missing",
        "cdp_not_logged_in",
        "login_challenge",
        "login_failed",
        "flow_mismatch",
        "network",
        "stale_feed",
      ].includes(failure.failure_type),
    );

    if (blocked) {
      expect(result.records).toHaveLength(0);
      expect(result.failures.length).toBeGreaterThan(0);
      return;
    }

    expect(result.records.length).toBe(5);
    const uniqueUrls = new Set(result.records.map((record) => record.url));
    expect(uniqueUrls.size).toBe(5);

    for (const record of result.records) {
      expect(record.source_type).toBe("x");
      expect(record.source_name).toBe("for_you");
      expect(record.url.includes("/status/")).toBe(true);
      expect(record.content.length).toBeGreaterThan(0);
      expect(record.fetched_at).toMatch(/T/);
    }
  }, 240000);
});
