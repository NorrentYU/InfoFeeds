import { describe, expect, it, vi } from "vitest";
import { XBrowserError } from "../../src/x/browser.js";
import { fetchXForYou } from "../../src/x/index.js";

describe("x retry behavior", () => {
  it("retries transient network errors and then succeeds", async () => {
    const scrapeForYouTimeline = vi
      .fn()
      .mockRejectedValueOnce(
        new XBrowserError("temporary network failure", {
          failureType: "network",
          retryable: true,
          attempt: 1,
        }),
      )
      .mockResolvedValueOnce({
        stream: "for_you",
        authMethod: "password_login",
        cards: [
          {
            text: "Recovered after retry",
            statusUrl: "/account/status/3003",
            publishedAt: "2026-03-06T00:00:00.000Z",
          },
        ],
        attempt: 2,
      });

    const result = await fetchXForYou(
      {
        mode: "test",
        preferCdp: false,
        credentials: { username: "u", password: "p" },
        retryCount: 1,
        retryDelayMs: 1,
      },
      {
        scrapeForYouViaCdp: vi.fn(),
        scrapeForYouTimeline,
      },
    );

    expect(result.records).toHaveLength(1);
    expect(result.failures).toHaveLength(0);
    expect(scrapeForYouTimeline).toHaveBeenCalledTimes(2);
  });
});
