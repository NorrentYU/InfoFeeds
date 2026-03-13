export type SourceType = "others";

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
  | "no_updates"
  | "unexpected";

export interface FailureRecord {
  source_name: string;
  source_url: string;
  feed_url: string;
  article_url?: string;
  occurred_at: string;
  failure_type: FailureType;
  retryable: boolean;
  detail: string;
  attempt: number;
}

export interface OthersFetchResult {
  records: NormalizedRecord[];
  failures: FailureRecord[];
}

export interface OthersSource {
  name?: string;
  url: string;
}

export interface OthersFetchOptions {
  windowHours?: number;
  latestCountPerSource?: number;
  now?: Date;
  timeoutMs?: number;
  retryCount?: number;
  retryDelayMs?: number;
  maxItemsPerSource?: number;
}

export interface FeedEntry {
  guid?: string;
  title: string;
  link: string;
  content: string;
  publishedAt: string;
}

export interface ParsedFeedFailure {
  detail: string;
  articleUrl?: string;
}

export interface ParsedFeedResult {
  entries: FeedEntry[];
  failures: ParsedFeedFailure[];
}
