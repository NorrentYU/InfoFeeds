export type SourceType = "telegram";

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
  | "no_external_link"
  | "x_content"
  | "no_updates"
  | "unexpected";

export interface FailureRecord {
  source_name: string;
  source_url: string;
  message_url?: string;
  external_url?: string;
  occurred_at: string;
  failure_type: FailureType;
  retryable: boolean;
  detail: string;
  attempt: number;
}

export interface TelegramFetchResult {
  records: NormalizedRecord[];
  failures: FailureRecord[];
  x_content_handoffs: XContentHandoff[];
}

export interface XContentHandoff {
  source_name: string;
  source_url: string;
  message_url?: string;
  x_url: string;
  published_at: string;
  occurred_at: string;
}

export interface TelegramMessage {
  sourceName: string;
  sourceUrl: string;
  messageUrl: string;
  messageText: string;
  messageTitle: string;
  externalLinks: string[];
  publishedAt: string;
}

export interface TelegramSource {
  name?: string;
  url: string;
}

export interface TelegramFetchOptions {
  windowHours?: number;
  now?: Date;
  timeoutMs?: number;
  retryCount?: number;
  retryDelayMs?: number;
  maxMessagesPerSource?: number;
}
