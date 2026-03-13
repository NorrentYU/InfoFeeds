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

export interface YoutubeFetchResult {
  records: NormalizedRecord[];
  failures: FailureRecord[];
}

export interface YoutubeSource {
  name?: string;
  url: string;
}

export interface YoutubeFetchOptions {
  latestOnly?: boolean;
  now?: Date;
  timeoutMs?: number;
  retryCount?: number;
  retryDelayMs?: number;
  maxVideosPerSource?: number;
  includeStreamTranscripts?: boolean;
  windowStartHoursAgo?: number;
  windowEndHoursAgo?: number;
  liveDelayHours?: number;
}

export type YoutubeChannelTab = "videos" | "streams";

export interface YoutubeVideoSummary {
  id: string;
  title: string;
  url: string;
  source_tab?: YoutubeChannelTab;
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
