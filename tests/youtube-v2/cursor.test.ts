import { describe, expect, it, vi } from "vitest";
import { fetchYoutubeSourcesV2 } from "../../src/youtube-v2/index.js";
import { buildJobCursorKey } from "../../src/youtube-v2/planner.js";
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

describe("youtube v2 cursor", () => {
  it("skips already-successful videos that are not newer than the cursor", async () => {
    const discoverFeedCandidates = vi.fn(async (job: YoutubeFeedJob) => ({
      status: "ok" as const,
      attempt: 1,
      candidates: [candidate(job, "video-1")],
    }));

    const getVideoDetails = vi.fn(async (url: string) => ({
      attempt: 1,
      video: {
        id: "video-1",
        title: "Video 1",
        url,
        publishedAt: "2026-03-06T08:00:00.000Z",
        wasLive: false,
        captionTracks: [TRACK],
      },
    }));

    const fetchCaptionText = vi.fn(async () => ({
      track: TRACK,
      text: "This transcript is valid and long enough to satisfy the YouTube validator for summarization.",
    }));

    const cursorKey = buildJobCursorKey({
      feedKind: "videos",
      sourceUrl: "https://www.youtube.com/@PeterYangYT",
    });

    const result = await fetchYoutubeSourcesV2(
      [SOURCE],
      {
        now: new Date("2026-03-06T12:00:00.000Z"),
        windowPolicy: {
          streams: false,
        },
        cursorState: {
          [cursorKey]: {
            latestSuccessfulPublishedAt: "2026-03-06T08:00:00.000Z",
          },
        },
      },
      {
        discoverFeedCandidates,
        getVideoDetails,
        fetchCaptionText,
      },
    );

    expect(result.records).toHaveLength(0);
    expect(fetchCaptionText).not.toHaveBeenCalled();
    expect(
      result.failures.some(
        (item) =>
          item.failure_type === "no_updates" &&
          item.detail.includes("cursor 命中"),
      ),
    ).toBe(true);
  });

  it("advances cursor state only when a record succeeds", async () => {
    const discoverFeedCandidates = vi.fn(async (job: YoutubeFeedJob) => ({
      status: "ok" as const,
      attempt: 1,
      candidates: [candidate(job, "video-2")],
    }));

    const getVideoDetails = vi.fn(async (url: string) => ({
      attempt: 1,
      video: {
        id: "video-2",
        title: "Video 2",
        url,
        publishedAt: "2026-03-06T09:00:00.000Z",
        wasLive: false,
        captionTracks: [TRACK],
      },
    }));

    const fetchCaptionText = vi.fn(async () => ({
      track: TRACK,
      text: "This transcript is valid and long enough to satisfy the YouTube validator for summarization.",
    }));

    const result = await fetchYoutubeSourcesV2(
      [SOURCE],
      {
        now: new Date("2026-03-06T12:00:00.000Z"),
        windowPolicy: {
          streams: false,
        },
      },
      {
        discoverFeedCandidates,
        getVideoDetails,
        fetchCaptionText,
      },
    );

    const cursorKey = buildJobCursorKey({
      feedKind: "videos",
      sourceUrl: "https://www.youtube.com/@PeterYangYT",
    });

    expect(result.records).toHaveLength(1);
    expect(result.cursor_state[cursorKey]?.latestSuccessfulPublishedAt).toBe(
      "2026-03-06T09:00:00.000Z",
    );
  });
});
