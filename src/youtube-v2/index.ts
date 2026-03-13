import {
  fetchCaptionText as fetchCaptionTextDefault,
  selectCaptionTrack,
} from "../youtube/captions.js";
import { validateYoutubeTranscript } from "../youtube/filters.js";
import {
  getVideoDetails as getVideoDetailsDefault,
  YtDlpError,
} from "../youtube/yt-dlp.js";
import { discoverFeedCandidates as discoverFeedCandidatesDefault } from "./discovery.js";
import {
  buildJobCursorKey,
  buildYoutubeFeedJobs,
  dedupeByUrlPreferStreams,
  formatJobWindow,
  isWithinJobWindow,
  normalizePlannedSources,
} from "./planner.js";
import { mapWithConcurrency } from "./pool.js";
import type {
  CaptionFetchResult,
  FailureRecord,
  NormalizedRecord,
  YoutubeCursorState,
  YoutubeDetailedCandidate,
  YoutubeDiscoveryResult,
  YoutubeFetchOptionsV2,
  YoutubeFetchResultV2,
  YoutubeFeedJob,
  YoutubeSourceInput,
  YoutubeVideoDetails,
} from "./types.js";

function truncateDetail(detail: string): string {
  const normalized = detail.replace(/\s+/g, " ").trim();
  const limit = 320;
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, 190)} ... ${normalized.slice(-110)}`;
}

function asErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function failure(params: {
  sourceName: string;
  sourceUrl: string;
  channelUrl: string;
  failureType: FailureRecord["failure_type"];
  detail: string;
  retryable: boolean;
  attempt: number;
  now: Date;
  videoUrl?: string;
}): FailureRecord {
  return {
    source_name: params.sourceName,
    source_url: params.sourceUrl,
    channel_url: params.channelUrl,
    video_url: params.videoUrl,
    occurred_at: params.now.toISOString(),
    failure_type: params.failureType,
    retryable: params.retryable,
    detail: truncateDetail(params.detail),
    attempt: params.attempt,
  };
}

function isNewerThanCursor(
  publishedAt: string,
  cursorPublishedAt: string | undefined,
): boolean {
  if (!cursorPublishedAt) {
    return true;
  }

  const publishedMs = new Date(publishedAt).getTime();
  const cursorMs = new Date(cursorPublishedAt).getTime();
  if (Number.isNaN(publishedMs) || Number.isNaN(cursorMs)) {
    return true;
  }

  return publishedMs > cursorMs;
}

interface SuccessfulRecord {
  feedKind: YoutubeFeedJob["feedKind"];
  jobKey: string;
  url: string;
  record: NormalizedRecord;
}

interface JobResult {
  records: SuccessfulRecord[];
  failures: FailureRecord[];
}

interface YoutubeV2Dependencies {
  discoverFeedCandidates?: (
    job: YoutubeFeedJob,
    options: {
      timeoutMs?: number;
      retryCount?: number;
      retryDelayMs?: number;
    },
  ) => Promise<YoutubeDiscoveryResult>;
  getVideoDetails?: (
    videoUrl: string,
    options: {
      timeoutMs?: number;
      retryCount?: number;
      retryDelayMs?: number;
    },
  ) => Promise<{ video: YoutubeVideoDetails; attempt: number }>;
  fetchCaptionText?: typeof fetchCaptionTextDefault;
}

async function loadDetailedCandidates(
  job: YoutubeFeedJob,
  discovery: YoutubeDiscoveryResult,
  options: YoutubeFetchOptionsV2,
  dependencies: YoutubeV2Dependencies,
): Promise<{
  detailed: YoutubeDetailedCandidate[];
  failures: FailureRecord[];
}> {
  const now = options.now ?? new Date();
  const getVideoDetails =
    dependencies.getVideoDetails || getVideoDetailsDefault;
  const results = await mapWithConcurrency(
    discovery.candidates,
    options.detailsConcurrency ?? 2,
    async (candidate) => {
      try {
        const result = await getVideoDetails(candidate.url, {
          timeoutMs: options.timeoutMs ?? 30000,
          retryCount: options.retryCount ?? 1,
          retryDelayMs: options.retryDelayMs ?? 1000,
        });
        return {
          kind: "ok" as const,
          value: {
            ...candidate,
            details: result.video,
            attempt: result.attempt,
          },
        };
      } catch (error) {
        const retryable = error instanceof YtDlpError ? error.retryable : true;
        const attempt = error instanceof YtDlpError ? error.attempt : 1;
        return {
          kind: "error" as const,
          failure: failure({
            sourceName: job.sourceName,
            sourceUrl: job.sourceUrl,
            channelUrl: job.channelUrl,
            videoUrl: candidate.url,
            failureType: "video_unavailable",
            detail: `视频详情拉取失败: ${asErrorMessage(error)}`,
            retryable,
            attempt,
            now,
          }),
        };
      }
    },
  );

  const detailed: YoutubeDetailedCandidate[] = [];
  const failures: FailureRecord[] = [];
  for (const result of results) {
    if (result.kind === "ok") {
      detailed.push(result.value);
      continue;
    }
    failures.push(result.failure);
  }

  return { detailed, failures };
}

async function extractJobTranscripts(
  job: YoutubeFeedJob,
  selected: YoutubeDetailedCandidate[],
  options: YoutubeFetchOptionsV2,
  dependencies: YoutubeV2Dependencies,
): Promise<JobResult> {
  const now = options.now ?? new Date();
  const fetchCaptionText =
    dependencies.fetchCaptionText || fetchCaptionTextDefault;
  const results = await mapWithConcurrency(
    selected,
    options.captionConcurrency ?? 2,
    async (candidate) => {
      const track = selectCaptionTrack(candidate.details.captionTracks);
      if (!track) {
        return {
          kind: "failure" as const,
          failure: failure({
            sourceName: job.sourceName,
            sourceUrl: job.sourceUrl,
            channelUrl: job.channelUrl,
            videoUrl: candidate.details.url,
            failureType: "transcript_missing",
            detail: "视频无可用字幕",
            retryable: false,
            attempt: candidate.attempt,
            now,
          }),
        };
      }

      let caption: CaptionFetchResult;
      try {
        caption = await fetchCaptionText(track, {
          timeoutMs: options.timeoutMs ?? 30000,
          retryCount: options.retryCount ?? 1,
          retryDelayMs: options.retryDelayMs ?? 1000,
        });
      } catch (error) {
        return {
          kind: "failure" as const,
          failure: failure({
            sourceName: job.sourceName,
            sourceUrl: job.sourceUrl,
            channelUrl: job.channelUrl,
            videoUrl: candidate.details.url,
            failureType: "network",
            detail: `字幕拉取失败: ${asErrorMessage(error)}`,
            retryable: true,
            attempt: 1,
            now,
          }),
        };
      }

      const validation = validateYoutubeTranscript({ text: caption.text });
      if (!validation.valid) {
        return {
          kind: "failure" as const,
          failure: failure({
            sourceName: job.sourceName,
            sourceUrl: job.sourceUrl,
            channelUrl: job.channelUrl,
            videoUrl: candidate.details.url,
            failureType: "invalid_content",
            detail: validation.reason,
            retryable: false,
            attempt: candidate.attempt,
            now,
          }),
        };
      }

      return {
        kind: "record" as const,
        record: {
          feedKind: job.feedKind,
          jobKey: buildJobCursorKey(job),
          url: candidate.details.url,
          record: {
            source_type: "youtube" as const,
            source_name: job.sourceName,
            title: candidate.details.title,
            content: caption.text,
            url: candidate.details.url,
            published_at: candidate.details.publishedAt,
            fetched_at: now.toISOString(),
          },
        },
      };
    },
  );

  const records: SuccessfulRecord[] = [];
  const failures: FailureRecord[] = [];
  for (const result of results) {
    if (result.kind === "record") {
      records.push(result.record);
      continue;
    }
    failures.push(result.failure);
  }

  return { records, failures };
}

async function processJob(
  job: YoutubeFeedJob,
  options: YoutubeFetchOptionsV2,
  dependencies: YoutubeV2Dependencies,
): Promise<JobResult> {
  const now = options.now ?? new Date();
  const discoverFeedCandidates =
    dependencies.discoverFeedCandidates || discoverFeedCandidatesDefault;

  let discovery: YoutubeDiscoveryResult;
  try {
    discovery = await discoverFeedCandidates(job, {
      timeoutMs: options.timeoutMs ?? 30000,
      retryCount: options.retryCount ?? 1,
      retryDelayMs: options.retryDelayMs ?? 1000,
    });
  } catch (error) {
    const retryable = error instanceof YtDlpError ? error.retryable : true;
    const attempt = error instanceof YtDlpError ? error.attempt : 1;
    return {
      records: [],
      failures: [
        failure({
          sourceName: job.sourceName,
          sourceUrl: job.sourceUrl,
          channelUrl: job.channelUrl,
          failureType: "network",
          detail: `频道列表拉取失败: ${asErrorMessage(error)}`,
          retryable,
          attempt,
          now,
        }),
      ],
    };
  }

  if (discovery.status === "no_updates" || discovery.candidates.length === 0) {
    return {
      records: [],
      failures: [
        failure({
          sourceName: job.sourceName,
          sourceUrl: job.sourceUrl,
          channelUrl: job.channelUrl,
          failureType: "no_updates",
          detail:
            discovery.detail ||
            `${job.feedKind} 窗口 ${formatJobWindow(job)} 内无候选视频`,
          retryable: false,
          attempt: discovery.attempt,
          now,
        }),
      ],
    };
  }

  const detailsPhase = await loadDetailedCandidates(
    job,
    discovery,
    options,
    dependencies,
  );

  const selected = detailsPhase.detailed.filter((candidate) =>
    isWithinJobWindow({
      publishedAt: candidate.details.publishedAt,
      now,
      job,
    }),
  );

  const cursorKey = buildJobCursorKey(job);
  const cursorPublishedAt =
    options.cursorState?.[cursorKey]?.latestSuccessfulPublishedAt;
  const freshSelection = selected.filter((candidate) =>
    isNewerThanCursor(candidate.details.publishedAt, cursorPublishedAt),
  );

  if (freshSelection.length === 0 && detailsPhase.detailed.length > 0) {
    const suffix =
      selected.length > 0 && cursorPublishedAt
        ? "（cursor 命中，无新增成功视频）"
        : "";
    return {
      records: [],
      failures: [
        ...detailsPhase.failures,
        failure({
          sourceName: job.sourceName,
          sourceUrl: job.sourceUrl,
          channelUrl: job.channelUrl,
          failureType: "no_updates",
          detail: `${job.feedKind} 窗口 ${formatJobWindow(job)} 内无可处理视频${suffix}`,
          retryable: false,
          attempt: discovery.attempt,
          now,
        }),
      ],
    };
  }

  const extractionPhase = await extractJobTranscripts(
    job,
    freshSelection,
    options,
    dependencies,
  );

  return {
    records: extractionPhase.records,
    failures: [...detailsPhase.failures, ...extractionPhase.failures],
  };
}

export async function fetchYoutubeSourcesV2(
  sources: YoutubeSourceInput[],
  options: YoutubeFetchOptionsV2 = {},
  dependencies: YoutubeV2Dependencies = {},
): Promise<YoutubeFetchResultV2> {
  const now = options.now ?? new Date();
  const records: SuccessfulRecord[] = [];
  const failures: FailureRecord[] = [];
  const cursorState: YoutubeCursorState = { ...(options.cursorState || {}) };

  const normalized = normalizePlannedSources(sources);
  for (const invalid of normalized.invalid) {
    failures.push(
      failure({
        sourceName: invalid.sourceName,
        sourceUrl: invalid.sourceUrl,
        channelUrl: invalid.sourceUrl,
        failureType: "parse",
        detail: "频道 URL 无效",
        retryable: false,
        attempt: 1,
        now,
      }),
    );
  }

  const jobs = buildYoutubeFeedJobs(normalized.sources, options.windowPolicy);
  const results = await mapWithConcurrency(
    jobs,
    options.jobConcurrency ?? 4,
    async (job) => processJob(job, options, dependencies),
  );

  for (const result of results) {
    records.push(...result.records);
    failures.push(...result.failures);
  }

  const deduped = dedupeByUrlPreferStreams(records)
    .map((item) => item.record)
    .sort((left, right) =>
      right.published_at.localeCompare(left.published_at),
    );

  for (const item of records) {
    const existing = cursorState[item.jobKey] || {};
    if (
      isNewerThanCursor(
        item.record.published_at,
        existing.latestSuccessfulPublishedAt,
      )
    ) {
      existing.latestSuccessfulPublishedAt = item.record.published_at;
    }
    existing.latestRunAt = now.toISOString();
    cursorState[item.jobKey] = existing;
  }

  return {
    records: deduped,
    failures,
    cursor_state: cursorState,
  };
}
