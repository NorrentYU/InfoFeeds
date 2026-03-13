import { describe, expect, it, vi } from "vitest";
import { runYoutubeV2Benchmark } from "../../src/youtube-v2/benchmark.js";

describe("youtube v2 benchmark", () => {
  it("runs sources with progress callbacks and summary totals", async () => {
    const events: string[] = [];
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({
        records: [{ url: "a" }],
        failures: [],
        cursor_state: {},
      })
      .mockResolvedValueOnce({
        records: [],
        failures: [
          {
            failure_type: "no_updates",
          },
          {
            failure_type: "no_updates",
          },
        ],
        cursor_state: {},
      });

    const summary = await runYoutubeV2Benchmark(
      ["https://www.youtube.com/@A", "https://www.youtube.com/@B"],
      {
        sourceConcurrency: 2,
        fetchFn: fetchFn as any,
        onProgress(event) {
          events.push(`${event.phase}:${event.source}`);
        },
      },
    );

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(events).toContain("start:https://www.youtube.com/@A");
    expect(events).toContain("done:https://www.youtube.com/@B");
    expect(summary.source_count).toBe(2);
    expect(summary.total_records).toBe(1);
    expect(summary.total_failures).toBe(2);
  });
});
