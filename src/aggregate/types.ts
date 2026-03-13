export type SourceType = "telegram" | "x" | "substack" | "youtube" | "others";

export interface NormalizedRecord {
  source_type: SourceType;
  source_name: string;
  title: string;
  content: string;
  url: string;
  published_at: string;
  fetched_at: string;
}

export interface ChannelResult {
  records: NormalizedRecord[];
  failures: unknown[];
}

export interface AggregationInput {
  telegram: ChannelResult;
  x: ChannelResult;
  substack: ChannelResult;
  youtube: ChannelResult;
  others: ChannelResult;
}

export type AggregateFailureType =
  | "invalid_content"
  | "deduped"
  | "summary_timeout"
  | "summary_call_failed"
  | "summary_format_invalid"
  | "pdf_render_failed"
  | "unexpected";

export interface AggregateFailureItem {
  source_type: SourceType;
  source_name: string;
  url: string;
  failure_type: AggregateFailureType;
  detail: string;
  attempt?: number;
  canonical_url?: string;
}

export interface DigestItem {
  source_type: SourceType;
  source_name: string;
  title: string;
  summary: string;
  url: string;
  published_at: string;
  canonical_url: string;
}

export interface DigestManifest {
  generated_at: string;
  timezone: string;
  input_count: number;
  filtered_count: number;
  deduped_count: number;
  summary_success_count: number;
  summary_failure_count: number;
  output_markdown: string;
  output_pdf: string;
  failed_items: AggregateFailureItem[];
}

export interface AggregateDigestOptions {
  now?: Date;
  timezone?: string;
  windowHours?: number;
  outputDir?: string;
  outputBaseName?: string;
  userPrompt?: string;
  summaryConcurrency?: number;
  summaryTimeoutMs?: number;
  summaryRetryCount?: number;
  minContentLength?: number;
  // Debug-only: enable per-item progress logs during summary stage.
  debugProgress?: boolean;
  // Debug-only: emit progress every N items.
  progressEvery?: number;
  // Debug-only: abort in-flight provider request when timeout happens.
  abortOnTimeout?: boolean;
}

export interface PreparedRecord extends NormalizedRecord {
  canonical_url: string;
  channel_order: number;
}

export interface SummaryRequest {
  prompt: string;
  source_type: SourceType;
  source_name: string;
  title: string;
  content: string;
  published_at: string;
  url: string;
  signal?: AbortSignal;
}

export type SummaryFn = (request: SummaryRequest) => Promise<string>;

export type PdfRenderFn = (params: {
  markdown: string;
  outputPath: string;
}) => Promise<void>;
