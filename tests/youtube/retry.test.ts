import { describe, expect, it, vi } from "vitest";
import { buildYtDlpArgs, YtDlpError } from "../../src/youtube/yt-dlp.js";
import { fetchYoutubeSources } from "../../src/youtube/index.js";

describe("youtube retry evidence", () => {
  it("injects cookies args when YOUTUBE_COOKIES_FILE is provided", () => {
    expect(buildYtDlpArgs(["--dump-single-json", "https://x"], "/tmp/y.txt")).toEqual([
      "--cookies",
      "/tmp/y.txt",
      "--dump-single-json",
      "https://x",
    ]);
    expect(buildYtDlpArgs(["--dump-single-json", "https://x"], "   ")).toEqual([
      "--dump-single-json",
      "https://x",
    ]);
  });

  it("keeps the successful output after one retried list failure", async () => {
    const listChannelVideos = vi
      .fn()
      .mockRejectedValueOnce(new YtDlpError("temporary network error", { retryable: true, attempt: 1 }))
      .mockResolvedValueOnce({
        attempt: 2,
        videos: [
          {
            id: "latest-1",
            title: "Latest video",
            url: "https://www.youtube.com/watch?v=latest-1",
          },
        ],
      });

    const result = await fetchYoutubeSources(
      ["https://www.youtube.com/@Messari"],
      {
        latestOnly: true,
        now: new Date("2026-03-06T00:00:00.000Z"),
      },
      {
        listChannelVideos: async (...args) => {
          try {
            return await listChannelVideos(...args);
          } catch {
            return await listChannelVideos(...args);
          }
        },
        getVideoDetails: vi.fn().mockResolvedValue({
          attempt: 1,
          video: {
            id: "latest-1",
            title: "Latest video",
            url: "https://www.youtube.com/watch?v=latest-1",
            publishedAt: "2026-03-05T10:00:00.000Z",
            captionTracks: [
              {
                url: "https://caption.example/latest-1.json3",
                language: "en",
                ext: "json3",
                kind: "auto",
              },
            ],
          },
        }),
        fetchCaptionText: vi.fn().mockResolvedValue({
          track: {
            url: "https://caption.example/latest-1.json3",
            language: "en",
            ext: "json3",
            kind: "auto",
          },
          text: "This transcript proves the retry path can still produce valid output after a transient failure.",
        }),
      },
    );

    expect(result.records).toHaveLength(1);
    expect(result.failures).toHaveLength(0);
  });
});
