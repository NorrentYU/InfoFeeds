import { describe, expect, it } from "vitest";
import { fetchTextWithRetry } from "../../src/telegram/http.js";

describe("fetch retry behavior", () => {
  it("retries once then fails with attempt=2", async () => {
    await expect(
      fetchTextWithRetry("http://127.0.0.1:9/retry-check", {
        timeoutMs: 1200,
        retryCount: 1,
        retryDelayMs: 10
      })
    ).rejects.toMatchObject({
      name: "FetchTextError",
      attempt: 2
    });
  });
});
