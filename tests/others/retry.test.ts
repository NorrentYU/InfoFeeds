import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchOthersSources } from "../../src/others/index.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("others retry behavior", () => {
  it("retries feed fetch and reports attempt=2 on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    const result = await fetchOthersSources(["https://every.to/chain-of-thought/"], {
      retryCount: 1,
      retryDelayMs: 1,
      timeoutMs: 1200,
    });

    const networkFailure = result.failures.find((f) => f.failure_type === "network");
    expect(networkFailure).toBeDefined();
    expect(networkFailure?.attempt).toBe(2);
  });
});
