import { buildVideoUrl } from "../youtube/url.js";
import { runYtDlpJson, YtDlpError } from "../youtube/yt-dlp.js";
import type { YoutubeDiscoveryResult, YoutubeFeedJob } from "./types.js";

function classifyNoUpdatesMessage(message: string): boolean {
  const lowered = message.toLowerCase();
  return (
    (lowered.includes("does not have a") && lowered.includes(" tab")) ||
    lowered.includes("the channel is not currently live") ||
    lowered.includes("this live event will begin in") ||
    lowered.includes("this live event has ended") ||
    lowered.includes("this live recording is not available") ||
    lowered.includes("premieres in")
  );
}

function formatNoUpdatesDetail(job: YoutubeFeedJob, message?: string): string {
  if (message && classifyNoUpdatesMessage(message)) {
    if (job.feedKind === "streams") {
      return "streams 列表不可用或当前无可访问直播回放";
    }
    return "videos 列表不可用或当前无可访问视频";
  }

  if (job.feedKind === "streams") {
    return "streams 列表无候选视频";
  }
  return "videos 列表无候选视频";
}

export async function discoverFeedCandidates(
  job: YoutubeFeedJob,
  options: {
    timeoutMs?: number;
    retryCount?: number;
    retryDelayMs?: number;
  } = {},
): Promise<YoutubeDiscoveryResult> {
  try {
    const result = await runYtDlpJson(
      [
        "--dump-single-json",
        "--flat-playlist",
        "--playlist-end",
        String(job.maxCandidatesPerSource),
        job.channelUrl,
      ],
      options,
    );

    const entries = ((result.data as Record<string, unknown>).entries ||
      []) as Array<Record<string, unknown>>;
    const candidates = entries
      .map((entry) => {
        const id = typeof entry.id === "string" ? entry.id : "";
        const title =
          typeof entry.title === "string" ? entry.title : "(无标题)";
        const urlCandidate =
          typeof entry.url === "string"
            ? entry.url
            : typeof entry.webpage_url === "string"
              ? entry.webpage_url
              : id;
        const url = buildVideoUrl(urlCandidate);
        if (!id || !url) {
          return null;
        }
        return {
          sourceName: job.sourceName,
          sourceUrl: job.sourceUrl,
          channelUrl: job.channelUrl,
          feedKind: job.feedKind,
          videoId: id,
          title,
          url,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    if (candidates.length === 0) {
      return {
        status: "no_updates",
        attempt: result.attempt,
        detail: formatNoUpdatesDetail(job),
        candidates: [],
      };
    }

    return {
      status: "ok",
      attempt: result.attempt,
      candidates,
    };
  } catch (error) {
    if (
      error instanceof YtDlpError &&
      classifyNoUpdatesMessage(error.message)
    ) {
      return {
        status: "no_updates",
        attempt: error.attempt,
        detail: formatNoUpdatesDetail(job, error.message),
        candidates: [],
      };
    }
    throw error;
  }
}
