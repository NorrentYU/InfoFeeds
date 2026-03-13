import {
  fetchCaptionText as fetchCaptionTextDefault,
  selectCaptionTrack,
} from "./captions.js";
import { validateYoutubeTranscript } from "./filters.js";
import {
  buildChannelTabUrls,
  normalizeSourceUrl,
  sourceNameFromUrl,
} from "./url.js";
import {
  getVideoDetails as getVideoDetailsDefault,
  listChannelVideos as listChannelVideosDefault,
  YtDlpError,
} from "./yt-dlp.js";
import type {
  CaptionFetchResult,
  FailureRecord,
  NormalizedRecord,
  YoutubeChannelTab,
  YoutubeFetchOptions,
  YoutubeFetchResult,
  YoutubeSource,
  YoutubeVideoDetails,
  YoutubeVideoSummary,
} from "./types.js";

function truncateDetail(detail: string): string {
  const normalized = detail.replace(/\s+/g, " ").trim();
  const limit = 320;
  if (normalized.length <= limit) {
    return normalized;
  }
  // Keep both head and tail so root-cause tokens (often at the end) are visible.
  const head = normalized.slice(0, 190);
  const tail = normalized.slice(-110);
  return `${head} ... ${tail}`;
}

function asErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function sourceNameOf(source: YoutubeSource | string): string {
  if (typeof source === "string") {
    return sourceNameFromUrl(source);
  }
  return source.name || sourceNameFromUrl(source.url);
}

function sourceUrlOf(source: YoutubeSource | string): string {
  if (typeof source === "string") {
    return source;
  }
  return source.url;
}

function isSystemicVideoDetailsError(message: string): boolean {
  const lowered = message.toLowerCase();
  return (
    lowered.includes("signature extraction failed") ||
    lowered.includes("nsig extraction failed") ||
    lowered.includes("decrypt nsig") ||
    lowered.includes("no title found in player responses") ||
    lowered.includes("sign in to confirm you’re not a bot") ||
    lowered.includes("sign in to confirm you're not a bot")
  );
}

function formatVideoDetailsFailureDetail(message: string): string {
  const lowered = message.toLowerCase();
  if (
    lowered.includes("sign in to confirm you’re not a bot") ||
    lowered.includes("sign in to confirm you're not a bot")
  ) {
    return "视频详情拉取失败: YouTube 反爬挑战（Sign in to confirm you're not a bot）";
  }

  if (
    lowered.includes("signature extraction failed") ||
    lowered.includes("nsig extraction failed") ||
    lowered.includes("decrypt nsig")
  ) {
    return "视频详情拉取失败: yt-dlp 签名提取失败（建议更新 yt-dlp 或启用 cookies）";
  }

  return `视频详情拉取失败: ${message}`;
}

function failure(params: {
  sourceName: string;
  sourceUrl: string;
  channelUrl: string;
  failureType: FailureRecord["failure_type"];
  detail: string;
  retryable: boolean;
  attempt: number;
  videoUrl?: string;
}): FailureRecord {
  return {
    source_name: params.sourceName,
    source_url: params.sourceUrl,
    channel_url: params.channelUrl,
    video_url: params.videoUrl,
    occurred_at: new Date().toISOString(),
    failure_type: params.failureType,
    retryable: params.retryable,
    detail: truncateDetail(params.detail),
    attempt: params.attempt,
  };
}

function withinYoutubeWindow(params: {
  publishedAt: string;
  now: Date;
  windowStartHoursAgo: number;
  windowEndHoursAgo: number;
}): boolean {
  const publishedMs = new Date(params.publishedAt).getTime();
  if (Number.isNaN(publishedMs)) {
    return false;
  }

  const nowMs = params.now.getTime();
  const newestAllowed = nowMs - params.windowEndHoursAgo * 60 * 60 * 1000;
  const oldestAllowed = nowMs - params.windowStartHoursAgo * 60 * 60 * 1000;
  return publishedMs >= oldestAllowed && publishedMs <= newestAllowed;
}

function shouldDelayAsLive(params: {
  summary: YoutubeVideoSummary;
  details: YoutubeVideoDetails;
}): boolean {
  return params.details.wasLive || params.summary.source_tab === "streams";
}

function resolveWindow(params: {
  delayedForLive: boolean;
  windowStartHoursAgo: number;
  windowEndHoursAgo: number;
  liveDelayHours: number;
}): { windowStartHoursAgo: number; windowEndHoursAgo: number } {
  if (!params.delayedForLive) {
    return {
      windowStartHoursAgo: params.windowStartHoursAgo,
      windowEndHoursAgo: params.windowEndHoursAgo,
    };
  }
  return {
    windowStartHoursAgo: params.windowStartHoursAgo + params.liveDelayHours,
    windowEndHoursAgo: params.windowEndHoursAgo + params.liveDelayHours,
  };
}

function dedupeSummariesPreferStreams(
  summaries: YoutubeVideoSummary[],
): YoutubeVideoSummary[] {
  const byUrl = new Map<string, YoutubeVideoSummary>();
  for (const summary of summaries) {
    const existing = byUrl.get(summary.url);
    if (!existing) {
      byUrl.set(summary.url, summary);
      continue;
    }
    if (existing.source_tab !== "streams" && summary.source_tab === "streams") {
      byUrl.set(summary.url, summary);
    }
  }
  return Array.from(byUrl.values());
}

export async function fetchYoutubeSources(
  sources: Array<YoutubeSource | string>,
  options: YoutubeFetchOptions = {},
  dependencies: {
    listChannelVideos?: typeof listChannelVideosDefault;
    getVideoDetails?: typeof getVideoDetailsDefault;
    fetchCaptionText?: typeof fetchCaptionTextDefault;
  } = {},
): Promise<YoutubeFetchResult> {
  const now = options.now ?? new Date();
  const latestOnly = options.latestOnly ?? false;
  const timeoutMs = options.timeoutMs ?? 30000;
  const retryCount = options.retryCount ?? 1;
  const retryDelayMs = options.retryDelayMs ?? 1000;
  const maxVideosPerSource = options.maxVideosPerSource ?? 6;
  const includeStreamTranscripts = options.includeStreamTranscripts ?? false;
  const windowStartHoursAgo = options.windowStartHoursAgo ?? 48;
  const windowEndHoursAgo = options.windowEndHoursAgo ?? 24;
  const liveDelayHours = options.liveDelayHours ?? 0;
  const records: NormalizedRecord[] = [];
  const failures: FailureRecord[] = [];
  const listChannelVideos =
    dependencies.listChannelVideos || listChannelVideosDefault;
  const getVideoDetails =
    dependencies.getVideoDetails || getVideoDetailsDefault;
  const fetchCaptionText =
    dependencies.fetchCaptionText || fetchCaptionTextDefault;

  for (const source of sources) {
    const sourceUrlRaw = sourceUrlOf(source);
    const sourceName = sourceNameOf(source);
    const sourceUrl = normalizeSourceUrl(sourceUrlRaw);
    const channelUrls = buildChannelTabUrls(sourceUrlRaw, {
      includeStreams: includeStreamTranscripts,
    });
    const channelUrl = channelUrls?.[0] || sourceUrlRaw;

    if (!sourceUrl || !channelUrls || channelUrls.length === 0) {
      failures.push(
        failure({
          sourceName,
          sourceUrl: sourceUrlRaw,
          channelUrl: sourceUrlRaw,
          failureType: "parse",
          detail: "频道 URL 无效",
          retryable: false,
          attempt: 1,
        }),
      );
      continue;
    }

    let listed: YoutubeVideoSummary[] = [];
    let listedChannelUrl = channelUrl;
    let listAttempt = 1;
    let listTabProbe: {
      availableTabs: YoutubeChannelTab[];
      skippedTabs: YoutubeChannelTab[];
    } = { availableTabs: [], skippedTabs: [] };
    try {
      const result = await listChannelVideos(sourceUrl, {
        timeoutMs,
        retryCount,
        retryDelayMs,
        maxVideos: maxVideosPerSource,
        includeStreams: includeStreamTranscripts,
      });
      listed = result.videos;
      listAttempt = result.attempt;
      listedChannelUrl = result.channelUrl || channelUrl;
      listTabProbe = result.tabProbe || {
        availableTabs: [],
        skippedTabs: [],
      };
    } catch (error) {
      const retryable = error instanceof YtDlpError ? error.retryable : true;
      const attempt = error instanceof YtDlpError ? error.attempt : 1;
      failures.push(
        failure({
          sourceName,
          sourceUrl,
          channelUrl: listedChannelUrl,
          failureType: "network",
          detail: `频道列表拉取失败: ${asErrorMessage(error)}`,
          retryable,
          attempt,
        }),
      );
      continue;
    }

    if (listed.length === 0) {
      const tabProbeDetail =
        listTabProbe.skippedTabs.length > 0
          ? `（已探测可用tab: ${listTabProbe.availableTabs.join(",") || "无"}；跳过tab: ${listTabProbe.skippedTabs.join(",")}）`
          : "";
      failures.push(
        failure({
          sourceName,
          sourceUrl,
          channelUrl: listedChannelUrl,
          failureType: "no_updates",
          detail: latestOnly
            ? `频道无可用最新视频${tabProbeDetail}`
            : `窗口内无可处理视频${tabProbeDetail}`,
          retryable: false,
          attempt: listAttempt,
        }),
      );
      continue;
    }

    const candidateSummaries = dedupeSummariesPreferStreams(
      latestOnly ? listed.slice(0, 1) : listed,
    );
    let inWindowCount = 0;
    let sourceRecordCount = 0;
    let detailsSuccessCount = 0;
    let detailsFailureCount = 0;
    let hasSystemicDetailsFailure = false;
    let policySkippedCount = 0;

    for (const summary of candidateSummaries) {
      if (!includeStreamTranscripts && summary.source_tab === "streams") {
        policySkippedCount += 1;
        continue;
      }

      let details: YoutubeVideoDetails;
      let detailsAttempt = 1;
      try {
        const result = await getVideoDetails(summary.url, {
          timeoutMs,
          retryCount,
          retryDelayMs,
        });
        details = result.video;
        detailsAttempt = result.attempt;
        detailsSuccessCount += 1;
      } catch (error) {
        const retryable = error instanceof YtDlpError ? error.retryable : true;
        const attempt = error instanceof YtDlpError ? error.attempt : 1;
        const message = asErrorMessage(error);
        detailsFailureCount += 1;
        failures.push(
          failure({
            sourceName,
            sourceUrl,
            channelUrl: listedChannelUrl,
            videoUrl: summary.url,
            failureType: "video_unavailable",
            detail: formatVideoDetailsFailureDetail(message),
            retryable,
            attempt,
          }),
        );
        if (isSystemicVideoDetailsError(message)) {
          hasSystemicDetailsFailure = true;
          break;
        }
        continue;
      }

      if (!includeStreamTranscripts && details.wasLive) {
        policySkippedCount += 1;
        continue;
      }

      if (
        !latestOnly &&
        !withinYoutubeWindow({
          publishedAt: details.publishedAt,
          now,
          ...resolveWindow({
            delayedForLive: shouldDelayAsLive({
              summary,
              details,
            }),
            windowStartHoursAgo,
            windowEndHoursAgo,
            liveDelayHours,
          }),
        })
      ) {
        continue;
      }

      inWindowCount += 1;

      const track = selectCaptionTrack(details.captionTracks);
      if (!track) {
        failures.push(
          failure({
            sourceName,
            sourceUrl,
            channelUrl: listedChannelUrl,
            videoUrl: details.url,
            failureType: "transcript_missing",
            detail: "视频无可用字幕",
            retryable: false,
            attempt: detailsAttempt,
          }),
        );
        continue;
      }

      let caption: CaptionFetchResult;
      try {
        caption = await fetchCaptionText(track, {
          timeoutMs,
          retryCount,
          retryDelayMs,
        });
      } catch (error) {
        failures.push(
          failure({
            sourceName,
            sourceUrl,
            channelUrl: listedChannelUrl,
            videoUrl: details.url,
            failureType: "network",
            detail: `字幕拉取失败: ${asErrorMessage(error)}`,
            retryable: true,
            attempt: detailsAttempt,
          }),
        );
        continue;
      }

      const validation = validateYoutubeTranscript({ text: caption.text });
      if (!validation.valid) {
        failures.push(
          failure({
            sourceName,
            sourceUrl,
            channelUrl: listedChannelUrl,
            videoUrl: details.url,
            failureType: "invalid_content",
            detail: validation.reason,
            retryable: false,
            attempt: detailsAttempt,
          }),
        );
        continue;
      }

      records.push({
        source_type: "youtube",
        source_name: sourceName,
        title: details.title,
        content: caption.text,
        url: details.url,
        published_at: details.publishedAt,
        fetched_at: now.toISOString(),
      });
      sourceRecordCount += 1;

      if (latestOnly) {
        break;
      }
    }

    if (
      !latestOnly &&
      inWindowCount === 0 &&
      detailsFailureCount === 0 &&
      (detailsSuccessCount > 0 || policySkippedCount > 0) &&
      !hasSystemicDetailsFailure
    ) {
      const policySuffix =
        !includeStreamTranscripts && policySkippedCount > 0
          ? "（默认关闭 stream transcript）"
          : "";
      failures.push(
        failure({
          sourceName,
          sourceUrl,
          channelUrl: listedChannelUrl,
          failureType: "no_updates",
          detail: `窗口 ${windowStartHoursAgo}h~${windowEndHoursAgo}h 内无更新证据${policySuffix}`,
          retryable: false,
          attempt: listAttempt,
        }),
      );
      continue;
    }

    if (sourceRecordCount === 0 && latestOnly) {
      const hasSourceFailure = failures.some(
        (entry) =>
          entry.source_name === sourceName &&
          (entry.channel_url === channelUrl ||
            entry.channel_url === listedChannelUrl),
      );
      if (!hasSourceFailure) {
        failures.push(
          failure({
            sourceName,
            sourceUrl,
            channelUrl: listedChannelUrl,
            failureType: "no_updates",
            detail: "最新视频未产出可用 transcript",
            retryable: false,
            attempt: listAttempt,
          }),
        );
      }
    }
  }

  return { records, failures };
}
