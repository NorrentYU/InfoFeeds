import { sourceNameFromUrl, normalizeSourceUrl } from "../youtube/url.js";
import { buildFeedChannelUrl } from "./url.js";
import type {
  YoutubeFeedJob,
  YoutubeFeedKind,
  YoutubeSourceInput,
  YoutubeWindowPolicy,
} from "./types.js";

const DEFAULT_POLICY = {
  videos: {
    enabled: true,
    windowStartHoursAgo: 24,
    windowEndHoursAgo: 0,
    maxCandidatesPerSource: 6,
  },
  streams: {
    enabled: true,
    windowStartHoursAgo: 96,
    windowEndHoursAgo: 72,
    maxCandidatesPerSource: 6,
  },
} as const;

export interface PlannedSource {
  sourceName: string;
  sourceUrl: string;
}

function sourceNameOf(source: YoutubeSourceInput): string {
  if (typeof source === "string") {
    return sourceNameFromUrl(source);
  }
  return source.name || sourceNameFromUrl(source.url);
}

function sourceUrlOf(source: YoutubeSourceInput): string {
  return typeof source === "string" ? source : source.url;
}

export function normalizePlannedSources(
  sources: YoutubeSourceInput[],
): { sources: PlannedSource[]; invalid: Array<{ sourceName: string; sourceUrl: string }> } {
  const valid: PlannedSource[] = [];
  const invalid: Array<{ sourceName: string; sourceUrl: string }> = [];

  for (const source of sources) {
    const sourceUrlRaw = sourceUrlOf(source);
    const sourceName = sourceNameOf(source);
    const normalized = normalizeSourceUrl(sourceUrlRaw);
    if (!normalized) {
      invalid.push({ sourceName, sourceUrl: sourceUrlRaw });
      continue;
    }
    valid.push({
      sourceName,
      sourceUrl: normalized,
    });
  }

  return { sources: valid, invalid };
}

function resolveFeedPolicy(
  feedKind: YoutubeFeedKind,
  policy: YoutubeWindowPolicy | undefined,
): {
  windowStartHoursAgo: number;
  windowEndHoursAgo: number;
  maxCandidatesPerSource: number;
} | null {
  const fallback = DEFAULT_POLICY[feedKind];
  const raw = policy?.[feedKind];
  if (raw === false || raw?.enabled === false) {
    return null;
  }

  const resolved = {
    windowStartHoursAgo:
      raw?.windowStartHoursAgo ?? fallback.windowStartHoursAgo,
    windowEndHoursAgo: raw?.windowEndHoursAgo ?? fallback.windowEndHoursAgo,
    maxCandidatesPerSource:
      raw?.maxCandidatesPerSource ?? fallback.maxCandidatesPerSource,
  };

  if (
    resolved.windowStartHoursAgo < resolved.windowEndHoursAgo ||
    resolved.windowStartHoursAgo < 0 ||
    resolved.windowEndHoursAgo < 0
  ) {
    throw new Error(
      `invalid ${feedKind} window: ${resolved.windowStartHoursAgo}h~${resolved.windowEndHoursAgo}h`,
    );
  }

  if (resolved.maxCandidatesPerSource <= 0) {
    throw new Error(`invalid ${feedKind} maxCandidatesPerSource`);
  }

  return resolved;
}

export function buildYoutubeFeedJobs(
  sources: PlannedSource[],
  policy?: YoutubeWindowPolicy,
): YoutubeFeedJob[] {
  const jobs: YoutubeFeedJob[] = [];

  for (const feedKind of ["videos", "streams"] as const) {
    const resolved = resolveFeedPolicy(feedKind, policy);
    if (!resolved) {
      continue;
    }

    for (const source of sources) {
      const channelUrl = buildFeedChannelUrl(source.sourceUrl, feedKind);
      if (!channelUrl) {
        continue;
      }
      jobs.push({
        sourceName: source.sourceName,
        sourceUrl: source.sourceUrl,
        channelUrl,
        feedKind,
        windowStartHoursAgo: resolved.windowStartHoursAgo,
        windowEndHoursAgo: resolved.windowEndHoursAgo,
        maxCandidatesPerSource: resolved.maxCandidatesPerSource,
      });
    }
  }

  return jobs;
}

export function isWithinJobWindow(params: {
  publishedAt: string;
  now: Date;
  job: YoutubeFeedJob;
}): boolean {
  const publishedMs = new Date(params.publishedAt).getTime();
  if (Number.isNaN(publishedMs)) {
    return false;
  }

  const nowMs = params.now.getTime();
  const newestAllowed = nowMs - params.job.windowEndHoursAgo * 60 * 60 * 1000;
  const oldestAllowed = nowMs - params.job.windowStartHoursAgo * 60 * 60 * 1000;
  return publishedMs >= oldestAllowed && publishedMs <= newestAllowed;
}

export function formatJobWindow(job: YoutubeFeedJob): string {
  const end =
    job.windowEndHoursAgo === 0 ? "T" : `T-${job.windowEndHoursAgo}h`;
  return `T-${job.windowStartHoursAgo}h ~ ${end}`;
}

export function buildJobCursorKey(
  job: Pick<YoutubeFeedJob, "feedKind" | "sourceUrl">,
): string {
  return `${job.feedKind}:${job.sourceUrl}`;
}

export function dedupeByUrlPreferStreams<T extends { url: string; feedKind: YoutubeFeedKind }>(
  items: T[],
): T[] {
  const byUrl = new Map<string, T>();

  for (const item of items) {
    const existing = byUrl.get(item.url);
    if (!existing) {
      byUrl.set(item.url, item);
      continue;
    }
    if (existing.feedKind !== "streams" && item.feedKind === "streams") {
      byUrl.set(item.url, item);
    }
  }

  return Array.from(byUrl.values());
}
