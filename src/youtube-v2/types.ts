export type SourceType = "youtube";

export interface NormalizedRecord {
  source_type: SourceType;
  source_name: string;
  title: string;
  content: string;
  url: string;
  published_at: string;
  fetched_at: string;
}

export type FailureType =
  | "network"
  | "parse"
  | "invalid_content"
  | "transcript_missing"
  | "video_unavailable"
  | "no_updates"
  | "unexpected";

export interface FailureRecord {
  source_name: string;
  source_url: string;
  channel_url: string;
  video_url?: string;
  occurred_at: string;
  failure_type: FailureType;
  retryable: boolean;
  detail: string;
  attempt: number;
}

export interface YoutubeFetchResultV2 {
  records: NormalizedRecord[];
  failures: FailureRecord[];
  cursor_state: YoutubeCursorState;
}

export interface YoutubeSource {
  name?: string;
  url: string;
}

export type YoutubeSourceInput = YoutubeSource | string;

export type YoutubeFeedKind = "videos" | "streams";

export interface YoutubeFeedWindowPolicy {
  enabled?: boolean;
  windowStartHoursAgo?: number;
  windowEndHoursAgo?: number;
  maxCandidatesPerSource?: number;
}

export interface YoutubeWindowPolicy {
  videos?: YoutubeFeedWindowPolicy | false;
  streams?: YoutubeFeedWindowPolicy | false;
}

export interface YoutubeFetchOptionsV2 {
  now?: Date;
  timeoutMs?: number;
  retryCount?: number;
  retryDelayMs?: number;
  jobConcurrency?: number;
  detailsConcurrency?: number;
  captionConcurrency?: number;
  windowPolicy?: YoutubeWindowPolicy;
  cursorState?: YoutubeCursorState;
}

export interface YoutubeFeedJob {
  sourceName: string;
  sourceUrl: string;
  channelUrl: string;
  feedKind: YoutubeFeedKind;
  windowStartHoursAgo: number;
  windowEndHoursAgo: number;
  maxCandidatesPerSource: number;
}

export interface CaptionTrack {
  url: string;
  language: string;
  ext: string;
  kind: "manual" | "auto";
}

export interface YoutubeVideoDetails {
  id: string;
  title: string;
  url: string;
  publishedAt: string;
  wasLive: boolean;
  captionTracks: CaptionTrack[];
}

export interface CaptionFetchResult {
  text: string;
  track: CaptionTrack;
}

export interface YoutubeCandidateVideo {
  sourceName: string;
  sourceUrl: string;
  channelUrl: string;
  feedKind: YoutubeFeedKind;
  videoId: string;
  title: string;
  url: string;
}

export interface YoutubeDetailedCandidate extends YoutubeCandidateVideo {
  details: YoutubeVideoDetails;
  attempt: number;
}

export interface YoutubeDiscoveryResult {
  status: "ok" | "no_updates";
  attempt: number;
  detail?: string;
  candidates: YoutubeCandidateVideo[];
}

export interface YoutubeJobCursor {
  latestSuccessfulPublishedAt?: string;
  latestRunAt?: string;
}

export type YoutubeCursorState = Record<string, YoutubeJobCursor>;
