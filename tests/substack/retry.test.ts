import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSubstackSources } from "../../src/substack/index.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("substack retry behavior", () => {
  it("retries feed fetch and reports attempt=2 on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    const result = await fetchSubstackSources(["https://demo.substack.com"], {
      retryCount: 1,
      retryDelayMs: 1,
      timeoutMs: 1200,
    });

    const networkFailure = result.failures.find((f) => f.failure_type === "network");
    expect(networkFailure).toBeDefined();
    expect(networkFailure?.attempt).toBe(2);
  });
});
