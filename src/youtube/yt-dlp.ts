import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readEnvValue } from "../common/env.js";
import { buildChannelTabUrls, buildVideoUrl } from "./url.js";
import type {
  CaptionTrack,
  YoutubeChannelTab,
  YoutubeVideoDetails,
  YoutubeVideoSummary,
} from "./types.js";

const execFileAsync = promisify(execFile);

export class YtDlpError extends Error {
  readonly retryable: boolean;
  readonly attempt: number;

  constructor(
    message: string,
    options: { retryable: boolean; attempt: number },
  ) {
    super(message);
    this.name = "YtDlpError";
    this.retryable = options.retryable;
    this.attempt = options.attempt;
  }
}

interface YtDlpOptions {
  timeoutMs: number;
  retryCount: number;
  retryDelayMs: number;
  binPath: string;
  cookiesFile?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function buildYtDlpArgs(
  args: string[],
  cookiesFile?: string,
): string[] {
  const normalized = cookiesFile?.trim();
  if (!normalized) {
    return [...args];
  }
  return ["--cookies", normalized, ...args];
}

function isRetryableMessage(message: string): boolean {
  const lowered = message.toLowerCase();
  return (
    lowered.includes("timed out") ||
    lowered.includes("temporar") ||
    lowered.includes("unable to download") ||
    lowered.includes("failed to resolve") ||
    lowered.includes("http error 5")
  );
}

function isCookieFallbackMessage(message: string): boolean {
  const lowered = message.toLowerCase();
  return (
    lowered.includes("the page needs to be reloaded") ||
    lowered.includes("cookies are no longer valid")
  );
}

type ChannelTabProbeErrorKind = "missing_tab" | "inactive_live" | "other";

function classifyChannelTabProbeError(message: string): ChannelTabProbeErrorKind {
  const lowered = message.toLowerCase();
  if (lowered.includes("does not have a") && lowered.includes(" tab")) {
    return "missing_tab";
  }
  if (
    lowered.includes("this live event will begin in") ||
    lowered.includes("this live event has ended") ||
    lowered.includes("this live recording is not available") ||
    lowered.includes("the channel is not currently live") ||
    lowered.includes("premieres in")
  ) {
    return "inactive_live";
  }
  return "other";
}

function channelTabFromUrl(channelUrl: string): YoutubeChannelTab {
  const pathname = new URL(channelUrl).pathname.replace(/\/+$/, "");
  const lastSegment = pathname.split("/").filter(Boolean).pop();
  if (lastSegment === "streams") {
    return "streams";
  }
  return "videos";
}

function normalizePublishedAt(
  value: unknown,
  fallbackUploadDate: unknown,
): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value * 1000).toISOString();
  }

  if (
    typeof fallbackUploadDate === "string" &&
    /^\d{8}$/.test(fallbackUploadDate)
  ) {
    const year = fallbackUploadDate.slice(0, 4);
    const month = fallbackUploadDate.slice(4, 6);
    const day = fallbackUploadDate.slice(6, 8);
    return new Date(`${year}-${month}-${day}T00:00:00.000Z`).toISOString();
  }

  return null;
}

function inferWasLive(data: Record<string, unknown>): boolean {
  if (data.was_live === true) {
    return true;
  }
  const liveStatus =
    typeof data.live_status === "string" ? data.live_status.toLowerCase() : "";
  return liveStatus === "was_live" || liveStatus === "post_live";
}

function toCaptionTracks(
  source: unknown,
  kind: CaptionTrack["kind"],
): CaptionTrack[] {
  if (!source || typeof source !== "object") {
    return [];
  }

  const entries: CaptionTrack[] = [];
  for (const [rawLanguage, variants] of Object.entries(
    source as Record<string, unknown>,
  )) {
    const language = String(rawLanguage);
    if (!Array.isArray(variants)) {
      continue;
    }
    for (const variant of variants) {
      if (!variant || typeof variant !== "object") {
        continue;
      }
      const variantRecord = variant as Record<string, unknown>;
      const urlValue = variantRecord.url;
      const extValue = variantRecord.ext;
      const url: string = typeof urlValue === "string" ? urlValue : "";
      const ext: string = typeof extValue === "string" ? extValue : "";

      if (!url || !ext) {
        continue;
      }

      entries.push({
        url,
        language,
        ext,
        kind,
      });
    }
  }

  return entries;
}

export async function runYtDlpJson(
  args: string[],
  partialOptions: Partial<YtDlpOptions> = {},
): Promise<{ data: unknown; attempt: number }> {
  const cookiesFile =
    partialOptions.cookiesFile ??
    (await readEnvValue("YOUTUBE_COOKIES_FILE"));
  const options: YtDlpOptions = {
    timeoutMs: partialOptions.timeoutMs ?? 30000,
    retryCount: partialOptions.retryCount ?? 1,
    retryDelayMs: partialOptions.retryDelayMs ?? 1000,
    binPath: partialOptions.binPath ?? "yt-dlp",
    cookiesFile,
  };
  let lastError: YtDlpError | null = null;

  for (let attempt = 1; attempt <= options.retryCount + 1; attempt += 1) {
    const execute = async (cookiesFile?: string): Promise<unknown> => {
      const execArgs = buildYtDlpArgs(args, cookiesFile);
      const result = await execFileAsync(options.binPath, execArgs, {
        timeout: options.timeoutMs,
        maxBuffer: 32 * 1024 * 1024,
      });
      return JSON.parse(result.stdout);
    };

    try {
      return {
        data: await execute(options.cookiesFile),
        attempt,
      };
    } catch (error) {
      let message = asErrorMessage(error);
      if (
        options.cookiesFile &&
        isCookieFallbackMessage(message)
      ) {
        try {
          return {
            data: await execute(undefined),
            attempt,
          };
        } catch (fallbackError) {
          message = asErrorMessage(fallbackError);
        }
      }

      const normalized = new YtDlpError(message, {
        retryable: isRetryableMessage(message),
        attempt,
      });
      lastError = normalized;

      if (!normalized.retryable || attempt > options.retryCount) {
        throw normalized;
      }

      await sleep(options.retryDelayMs * attempt);
    }
  }

  throw (
    lastError ||
    new YtDlpError("yt-dlp 执行失败", {
      retryable: false,
      attempt: 1,
    })
  );
}

export async function listChannelVideos(
  sourceUrl: string,
  options: Partial<YtDlpOptions> & { maxVideos?: number; includeStreams?: boolean } = {},
): Promise<{
  videos: YoutubeVideoSummary[];
  attempt: number;
  channelUrl?: string;
  tabProbe: {
    availableTabs: YoutubeChannelTab[];
    skippedTabs: YoutubeChannelTab[];
  };
}> {
  const channelUrls = buildChannelTabUrls(sourceUrl, {
    includeStreams: options.includeStreams ?? false,
  });
  if (!channelUrls || channelUrls.length === 0) {
    throw new YtDlpError("频道 URL 无效", { retryable: false, attempt: 1 });
  }
  let lastSkippedTabError: YtDlpError | null = null;
  const collected: YoutubeVideoSummary[] = [];
  let maxAttempt = 1;
  let firstSuccessChannelUrl: string | undefined;
  const availableTabs = new Set<YoutubeChannelTab>();
  const skippedTabs = new Set<YoutubeChannelTab>();

  for (const channelUrl of channelUrls) {
    const sourceTab = channelTabFromUrl(channelUrl);
    try {
      const result = await runYtDlpJson(
        [
          "--dump-single-json",
          "--flat-playlist",
          "--playlist-end",
          String(options.maxVideos ?? 8),
          channelUrl,
        ],
        options,
      );
      maxAttempt = Math.max(maxAttempt, result.attempt);
      if (!firstSuccessChannelUrl) {
        firstSuccessChannelUrl = channelUrl;
      }
      availableTabs.add(sourceTab);

      const entries = ((result.data as Record<string, unknown>).entries ||
        []) as Array<Record<string, unknown>>;

      const videos: YoutubeVideoSummary[] = [];
      for (const entry of entries) {
        const id = typeof entry.id === "string" ? entry.id : "";
        const title = typeof entry.title === "string" ? entry.title : "(无标题)";
        const urlCandidate =
          typeof entry.url === "string"
            ? entry.url
            : typeof entry.webpage_url === "string"
              ? entry.webpage_url
              : id;
        const url = buildVideoUrl(urlCandidate);

        if (!id || !url) {
          continue;
        }

        videos.push({
          id,
          title,
          url,
          source_tab: sourceTab,
        });
      }
      collected.push(...videos);
    } catch (error) {
      if (error instanceof YtDlpError) {
        const classified = classifyChannelTabProbeError(error.message);
        if (classified !== "other") {
          skippedTabs.add(sourceTab);
          lastSkippedTabError = error;
          continue;
        }
      }
      throw error;
    }
  }

  if (collected.length > 0) {
    const dedupedByKey = new Map<string, YoutubeVideoSummary>();
    for (const video of collected) {
      const key = `${video.id}:${video.url}`;
      const existing = dedupedByKey.get(key);
      if (!existing) {
        dedupedByKey.set(key, video);
        continue;
      }

      // Keep streams provenance when the same video exists in both tabs.
      // The delayed-window policy depends on preserving "streams" classification.
      if (existing.source_tab !== "streams" && video.source_tab === "streams") {
        dedupedByKey.set(key, video);
      }
    }
    const deduped = Array.from(dedupedByKey.values());
    return {
      videos: deduped,
      attempt: maxAttempt,
      channelUrl: firstSuccessChannelUrl,
      tabProbe: {
        availableTabs: Array.from(availableTabs),
        skippedTabs: Array.from(skippedTabs),
      },
    };
  }

  if (lastSkippedTabError) {
    throw new YtDlpError("频道无可用的视频或直播列表标签", {
      retryable: false,
      attempt: lastSkippedTabError.attempt,
    });
  }

  throw new YtDlpError("频道 URL 无效", { retryable: false, attempt: 1 });
}

export async function getVideoDetails(
  videoUrl: string,
  options: Partial<YtDlpOptions> = {},
): Promise<{ video: YoutubeVideoDetails; attempt: number }> {
  const result = await runYtDlpJson(["--dump-single-json", videoUrl], options);
  const data = result.data as Record<string, unknown>;
  const id = typeof data.id === "string" ? data.id : "";
  const title = typeof data.title === "string" ? data.title : "(无标题)";
  const url = buildVideoUrl(
    typeof data.original_url === "string"
      ? data.original_url
      : typeof data.webpage_url === "string"
        ? data.webpage_url
        : videoUrl,
  );
  const publishedAt = normalizePublishedAt(data.timestamp, data.upload_date);

  if (!id || !url || !publishedAt) {
    throw new YtDlpError("视频详情缺少关键字段", {
      retryable: false,
      attempt: result.attempt,
    });
  }

  return {
    video: {
      id,
      title,
      url,
      publishedAt,
      wasLive: inferWasLive(data),
      captionTracks: [
        ...toCaptionTracks(data.subtitles, "manual"),
        ...toCaptionTracks(data.automatic_captions, "auto"),
      ],
    },
    attempt: result.attempt,
  };
}
