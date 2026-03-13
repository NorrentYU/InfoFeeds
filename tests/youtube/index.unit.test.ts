import { describe, expect, it, vi } from "vitest";
import { fetchYoutubeSources } from "../../src/youtube/index.js";
import type { CaptionTrack } from "../../src/youtube/types.js";

const SOURCE = "https://www.youtube.com/@PeterYangYT";

describe("youtube fetcher", () => {
  it("returns latest video transcript in latestOnly mode", async () => {
    const result = await fetchYoutubeSources(
      [SOURCE],
      {
        latestOnly: true,
        now: new Date("2026-03-06T00:00:00.000Z"),
      },
      {
        listChannelVideos: vi.fn().mockResolvedValue({
          attempt: 1,
          videos: [
            {
              id: "latest-1",
              title: "Latest video",
              url: "https://www.youtube.com/watch?v=latest-1",
            },
            {
              id: "older-1",
              title: "Older video",
              url: "https://www.youtube.com/watch?v=older-1",
            },
          ],
        }),
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
              } satisfies CaptionTrack,
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
          text: "This is a valid latest transcript that is definitely longer than eighty characters for validation.",
        }),
      },
    );

    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.source_type).toBe("youtube");
    expect(result.records[0]?.source_name).toBe("PeterYangYT");
    expect(result.records[0]?.url).toBe("https://www.youtube.com/watch?v=latest-1");
    expect(result.failures).toHaveLength(0);
  });

  it("returns transcript_missing when latest video has no captions", async () => {
    const result = await fetchYoutubeSources(
      [SOURCE],
      {
        latestOnly: true,
        now: new Date("2026-03-06T00:00:00.000Z"),
      },
      {
        listChannelVideos: vi.fn().mockResolvedValue({
          attempt: 1,
          videos: [
            {
              id: "latest-1",
              title: "Latest video",
              url: "https://www.youtube.com/watch?v=latest-1",
            },
          ],
        }),
        getVideoDetails: vi.fn().mockResolvedValue({
          attempt: 1,
          video: {
            id: "latest-1",
            title: "Latest video",
            url: "https://www.youtube.com/watch?v=latest-1",
            publishedAt: "2026-03-05T10:00:00.000Z",
            captionTracks: [],
          },
        }),
        fetchCaptionText: vi.fn(),
      },
    );

    expect(result.records).toHaveLength(0);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.failure_type).toBe("transcript_missing");
    expect(result.failures[0]?.video_url).toBe("https://www.youtube.com/watch?v=latest-1");
  });

  it("applies default 48h to 24h window in normal mode", async () => {
    const getVideoDetails = vi
      .fn()
      .mockResolvedValueOnce({
        attempt: 1,
        video: {
          id: "too-new",
          title: "Too new",
          url: "https://www.youtube.com/watch?v=too-new",
          publishedAt: "2026-03-05T18:00:00.000Z",
          captionTracks: [
            {
              url: "https://caption.example/too-new.json3",
              language: "en",
              ext: "json3",
              kind: "auto",
            } satisfies CaptionTrack,
          ],
        },
      })
      .mockResolvedValueOnce({
        attempt: 1,
        video: {
          id: "in-window",
          title: "In window",
          url: "https://www.youtube.com/watch?v=in-window",
          publishedAt: "2026-03-04T10:00:00.000Z",
          captionTracks: [
            {
              url: "https://caption.example/in-window.json3",
              language: "en",
              ext: "json3",
              kind: "auto",
            } satisfies CaptionTrack,
          ],
        },
      });

    const fetchCaptionText = vi.fn().mockResolvedValue({
      track: {
        url: "https://caption.example/in-window.json3",
        language: "en",
        ext: "json3",
        kind: "auto",
      },
      text: "This transcript is valid and should pass the filter because it has enough descriptive content.",
    });

    const result = await fetchYoutubeSources(
      [SOURCE],
      {
        now: new Date("2026-03-06T00:00:00.000Z"),
      },
      {
        listChannelVideos: vi.fn().mockResolvedValue({
          attempt: 1,
          videos: [
            {
              id: "too-new",
              title: "Too new",
              url: "https://www.youtube.com/watch?v=too-new",
            },
            {
              id: "in-window",
              title: "In window",
              url: "https://www.youtube.com/watch?v=in-window",
            },
          ],
        }),
        getVideoDetails,
        fetchCaptionText,
      },
    );

    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.url).toBe("https://www.youtube.com/watch?v=in-window");
    expect(fetchCaptionText).toHaveBeenCalledTimes(1);
  });

  it("does not append no_updates when video details are unavailable", async () => {
    const getVideoDetails = vi
      .fn()
      .mockRejectedValue(
        new Error(
          "ERROR: [youtube] abc123: Signature extraction failed: some player update",
        ),
      );

    const result = await fetchYoutubeSources(
      [SOURCE],
      {
        latestOnly: false,
        now: new Date("2026-03-06T00:00:00.000Z"),
      },
      {
        listChannelVideos: vi.fn().mockResolvedValue({
          attempt: 1,
          videos: [
            {
              id: "abc123",
              title: "Latest video",
              url: "https://www.youtube.com/watch?v=abc123",
            },
            {
              id: "def456",
              title: "Older video",
              url: "https://www.youtube.com/watch?v=def456",
            },
          ],
        }),
        getVideoDetails,
        fetchCaptionText: vi.fn(),
      },
    );

    expect(result.records).toHaveLength(0);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.failure_type).toBe("video_unavailable");
    expect(result.failures[0]?.detail).toContain("视频详情拉取失败");
    // Systemic details failures should short-circuit same source.
    expect(getVideoDetails).toHaveBeenCalledTimes(1);
    const hasNoUpdates = result.failures.some(
      (item) => item.failure_type === "no_updates",
    );
    expect(hasNoUpdates).toBe(false);
  });

  it("applies delayed window to streams entries when liveDelayHours is set", async () => {
    const getVideoDetails = vi
      .fn()
      .mockResolvedValueOnce({
        attempt: 1,
        video: {
          id: "stream-too-new",
          title: "Recent stream",
          url: "https://www.youtube.com/watch?v=stream-too-new",
          publishedAt: "2026-03-05T12:00:00.000Z",
          captionTracks: [
            {
              url: "https://caption.example/stream-too-new.json3",
              language: "en",
              ext: "json3",
              kind: "auto",
            } satisfies CaptionTrack,
          ],
        },
      })
      .mockResolvedValueOnce({
        attempt: 1,
        video: {
          id: "stream-in-delayed-window",
          title: "Delayed stream",
          url: "https://www.youtube.com/watch?v=stream-in-delayed-window",
          publishedAt: "2026-03-04T12:00:00.000Z",
          captionTracks: [
            {
              url: "https://caption.example/stream-in-delayed-window.json3",
              language: "en",
              ext: "json3",
              kind: "auto",
            } satisfies CaptionTrack,
          ],
        },
      });

    const fetchCaptionText = vi.fn().mockResolvedValue({
      track: {
        url: "https://caption.example/stream-in-delayed-window.json3",
        language: "en",
        ext: "json3",
        kind: "auto",
      },
      text: "This delayed stream transcript is valid and long enough to pass the minimum quality validation check.",
    });

    const result = await fetchYoutubeSources(
      [SOURCE],
      {
        latestOnly: false,
        now: new Date("2026-03-06T00:00:00.000Z"),
        includeStreamTranscripts: true,
        windowStartHoursAgo: 24,
        windowEndHoursAgo: 0,
        liveDelayHours: 24,
      },
      {
        listChannelVideos: vi.fn().mockResolvedValue({
          attempt: 1,
          videos: [
            {
              id: "stream-too-new",
              title: "Recent stream",
              url: "https://www.youtube.com/watch?v=stream-too-new",
              source_tab: "streams",
            },
            {
              id: "stream-in-delayed-window",
              title: "Delayed stream",
              url: "https://www.youtube.com/watch?v=stream-in-delayed-window",
              source_tab: "streams",
            },
          ],
        }),
        getVideoDetails,
        fetchCaptionText,
      },
    );

    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.url).toBe(
      "https://www.youtube.com/watch?v=stream-in-delayed-window",
    );
    expect(fetchCaptionText).toHaveBeenCalledTimes(1);
  });

  it("skips streams by default when includeStreamTranscripts is not enabled", async () => {
    const fetchCaptionText = vi.fn();
    const result = await fetchYoutubeSources(
      [SOURCE],
      {
        latestOnly: false,
        now: new Date("2026-03-06T00:00:00.000Z"),
        windowStartHoursAgo: 24,
        windowEndHoursAgo: 0,
        liveDelayHours: 24,
      },
      {
        listChannelVideos: vi.fn().mockResolvedValue({
          attempt: 1,
          videos: [
            {
              id: "stream-only",
              title: "Stream only",
              url: "https://www.youtube.com/watch?v=stream-only",
              source_tab: "streams",
            },
          ],
        }),
        getVideoDetails: vi.fn(),
        fetchCaptionText,
      },
    );

    expect(result.records).toHaveLength(0);
    expect(
      result.failures.some(
        (item) =>
          item.failure_type === "no_updates" &&
          item.detail.includes("默认关闭 stream transcript"),
      ),
    ).toBe(true);
    expect(fetchCaptionText).toHaveBeenCalledTimes(0);
  });

  it("treats duplicated videos as streams when both videos/streams tabs include same url", async () => {
    const fetchCaptionText = vi.fn().mockResolvedValue({
      track: {
        url: "https://caption.example/same.json3",
        language: "en",
        ext: "json3",
        kind: "auto",
      },
      text: "This transcript is valid and long enough for quality checks in delayed stream window validation.",
    });

    const result = await fetchYoutubeSources(
      [SOURCE],
      {
        latestOnly: false,
        now: new Date("2026-03-06T00:00:00.000Z"),
        includeStreamTranscripts: true,
        windowStartHoursAgo: 24,
        windowEndHoursAgo: 0,
        liveDelayHours: 24,
      },
      {
        listChannelVideos: vi.fn().mockResolvedValue({
          attempt: 1,
          videos: [
            {
              id: "same-id",
              title: "Duplicate from videos tab",
              url: "https://www.youtube.com/watch?v=same-id",
              source_tab: "videos",
            },
            {
              id: "same-id",
              title: "Duplicate from streams tab",
              url: "https://www.youtube.com/watch?v=same-id",
              source_tab: "streams",
            },
          ],
        }),
        getVideoDetails: vi.fn().mockResolvedValue({
          attempt: 1,
          video: {
            id: "same-id",
            title: "Duplicate clip",
            url: "https://www.youtube.com/watch?v=same-id",
            // 12h old: should be excluded by delayed stream window (48h~24h)
            publishedAt: "2026-03-05T12:00:00.000Z",
            captionTracks: [
              {
                url: "https://caption.example/same.json3",
                language: "en",
                ext: "json3",
                kind: "auto",
              } satisfies CaptionTrack,
            ],
          },
        }),
        fetchCaptionText,
      },
    );

    expect(result.records).toHaveLength(0);
    expect(
      result.failures.some((item) => item.failure_type === "no_updates"),
    ).toBe(true);
    expect(fetchCaptionText).toHaveBeenCalledTimes(0);
  });

  it("applies delayed window when yt-dlp marks video as was_live even from videos tab", async () => {
    const fetchCaptionText = vi.fn().mockResolvedValue({
      track: {
        url: "https://caption.example/live-flag.json3",
        language: "en",
        ext: "json3",
        kind: "auto",
      },
      text: "This transcript should not be used when live-delay window excludes a was_live item from recent 24h.",
    });

    const result = await fetchYoutubeSources(
      [SOURCE],
      {
        latestOnly: false,
        now: new Date("2026-03-06T00:00:00.000Z"),
        includeStreamTranscripts: true,
        windowStartHoursAgo: 24,
        windowEndHoursAgo: 0,
        liveDelayHours: 24,
      },
      {
        listChannelVideos: vi.fn().mockResolvedValue({
          attempt: 1,
          videos: [
            {
              id: "was-live-video",
              title: "Was live video",
              url: "https://www.youtube.com/watch?v=was-live-video",
              source_tab: "videos",
            },
          ],
        }),
        getVideoDetails: vi.fn().mockResolvedValue({
          attempt: 1,
          video: {
            id: "was-live-video",
            title: "Was live video",
            url: "https://www.youtube.com/watch?v=was-live-video",
            publishedAt: "2026-03-05T12:00:00.000Z",
            wasLive: true,
            captionTracks: [
              {
                url: "https://caption.example/live-flag.json3",
                language: "en",
                ext: "json3",
                kind: "auto",
              } satisfies CaptionTrack,
            ],
          },
        }),
        fetchCaptionText,
      },
    );

    expect(result.records).toHaveLength(0);
    expect(
      result.failures.some((item) => item.failure_type === "no_updates"),
    ).toBe(true);
    expect(fetchCaptionText).toHaveBeenCalledTimes(0);
  });

  it("keeps tail error reason after detail truncation", async () => {
    const longPrefix = "x".repeat(260);
    const rootCause = "Sign in to confirm you're not a bot";
    const getVideoDetails = vi
      .fn()
      .mockRejectedValue(new Error(`${longPrefix} ${rootCause}`));

    const result = await fetchYoutubeSources(
      [SOURCE],
      {
        latestOnly: true,
        now: new Date("2026-03-06T00:00:00.000Z"),
      },
      {
        listChannelVideos: vi.fn().mockResolvedValue({
          attempt: 1,
          videos: [
            {
              id: "abc123",
              title: "Latest video",
              url: "https://www.youtube.com/watch?v=abc123",
            },
          ],
        }),
        getVideoDetails,
        fetchCaptionText: vi.fn(),
      },
    );

    expect(result.records).toHaveLength(0);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.failure_type).toBe("video_unavailable");
    expect(result.failures[0]?.detail.toLowerCase()).toContain(
      "sign in to confirm you're not a bot",
    );
  });
});
