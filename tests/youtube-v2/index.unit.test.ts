import { describe, expect, it, vi } from "vitest";
import { fetchYoutubeSourcesV2 } from "../../src/youtube-v2/index.js";
import type {
  CaptionTrack,
  YoutubeCandidateVideo,
  YoutubeFeedJob,
} from "../../src/youtube-v2/types.js";

const SOURCE = "https://www.youtube.com/@PeterYangYT";

function candidate(
  job: YoutubeFeedJob,
  id: string,
): YoutubeCandidateVideo {
  return {
    sourceName: job.sourceName,
    sourceUrl: job.sourceUrl,
    channelUrl: job.channelUrl,
    feedKind: job.feedKind,
    videoId: id,
    title: id,
    url: `https://www.youtube.com/watch?v=${id}`,
  };
}

const TRACK: CaptionTrack = {
  url: "https://captions.example/transcript.json3",
  language: "en",
  ext: "json3",
  kind: "auto",
};

describe("youtube v2 fetcher", () => {
  it("processes videos and streams with independent default windows", async () => {
    const discoverFeedCandidates = vi.fn(async (job: YoutubeFeedJob) => {
      if (job.feedKind === "videos") {
        return {
          status: "ok" as const,
          attempt: 1,
          candidates: [candidate(job, "video-1")],
        };
      }

      return {
        status: "ok" as const,
        attempt: 1,
        candidates: [candidate(job, "stream-1")],
      };
    });

    const getVideoDetails = vi.fn(async (url: string) => {
      if (url.endsWith("video-1")) {
        return {
          attempt: 1,
          video: {
            id: "video-1",
            title: "Video 1",
            url,
            publishedAt: "2026-03-06T08:00:00.000Z",
            wasLive: false,
            captionTracks: [TRACK],
          },
        };
      }

      return {
        attempt: 1,
        video: {
          id: "stream-1",
          title: "Stream 1",
          url,
          publishedAt: "2026-03-03T06:00:00.000Z",
          wasLive: true,
          captionTracks: [TRACK],
        },
      };
    });

    const fetchCaptionText = vi.fn(async () => ({
      track: TRACK,
      text: "This transcript is valid and long enough to satisfy the YouTube validator for summarization.",
    }));

    const result = await fetchYoutubeSourcesV2(
      [SOURCE],
      {
        now: new Date("2026-03-06T12:00:00.000Z"),
      },
      {
        discoverFeedCandidates,
        getVideoDetails,
        fetchCaptionText,
      },
    );

    expect(result.records).toHaveLength(2);
    expect(result.failures).toHaveLength(0);
    expect(result.records.map((item) => item.url).sort()).toEqual([
      "https://www.youtube.com/watch?v=stream-1",
      "https://www.youtube.com/watch?v=video-1",
    ]);
  });

  it("returns parse failure for invalid sources and keeps valid jobs running", async () => {
    const discoverFeedCandidates = vi.fn(async (job: YoutubeFeedJob) => ({
      status: "ok" as const,
      attempt: 1,
      candidates: [candidate(job, `${job.feedKind}-1`)],
    }));

    const getVideoDetails = vi.fn(async (url: string) => ({
      attempt: 1,
      video: {
        id: url.split("=").pop() || "x",
        title: "Title",
        url,
        publishedAt:
          url.includes("streams")
            ? "2026-03-03T06:00:00.000Z"
            : "2026-03-06T08:00:00.000Z",
        wasLive: url.includes("streams"),
        captionTracks: [TRACK],
      },
    }));

    const fetchCaptionText = vi.fn(async () => ({
      track: TRACK,
      text: "This transcript is valid and long enough to satisfy the YouTube validator for summarization.",
    }));

    const result = await fetchYoutubeSourcesV2(
      ["http://", SOURCE],
      {
        now: new Date("2026-03-06T12:00:00.000Z"),
      },
      {
        discoverFeedCandidates,
        getVideoDetails,
        fetchCaptionText,
      },
    );

    expect(result.records).toHaveLength(2);
    expect(result.failures.some((item) => item.failure_type === "parse")).toBe(
      true,
    );
  });

  it("records transcript_missing and no_updates separately", async () => {
    const discoverFeedCandidates = vi.fn(async (job: YoutubeFeedJob) => {
      if (job.feedKind === "streams") {
        return {
          status: "no_updates" as const,
          attempt: 1,
          detail: "streams 列表无候选视频",
          candidates: [],
        };
      }
      return {
        status: "ok" as const,
        attempt: 1,
        candidates: [candidate(job, "video-no-caption")],
      };
    });

    const getVideoDetails = vi.fn(async (url: string) => ({
      attempt: 1,
      video: {
        id: "video-no-caption",
        title: "Video without captions",
        url,
        publishedAt: "2026-03-06T08:00:00.000Z",
        wasLive: false,
        captionTracks: [],
      },
    }));

    const result = await fetchYoutubeSourcesV2(
      [SOURCE],
      {
        now: new Date("2026-03-06T12:00:00.000Z"),
      },
      {
        discoverFeedCandidates,
        getVideoDetails,
      },
    );

    expect(result.records).toHaveLength(0);
    expect(result.failures).toHaveLength(2);
    expect(result.failures.map((item) => item.failure_type).sort()).toEqual([
      "no_updates",
      "transcript_missing",
    ]);
  });
});
