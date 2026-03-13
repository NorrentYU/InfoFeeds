export type SourceType = "x";

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
  | "auth_config"
  | "cdp_unavailable"
  | "cdp_context_missing"
  | "cdp_not_logged_in"
  | "login_failed"
  | "login_challenge"
  | "flow_mismatch"
  | "stale_feed"
  | "network"
  | "parse"
  | "invalid_content"
  | "no_updates"
  | "unexpected";

export interface FailureRecord {
  source_name: string;
  source_url: string;
  occurred_at: string;
  failure_type: FailureType;
  retryable: boolean;
  detail: string;
  attempt: number;
  tweet_url?: string;
}

export interface XFetchResult {
  records: NormalizedRecord[];
  failures: FailureRecord[];
}

export interface XCredentials {
  username: string;
  password: string;
}

export interface XFetchOptions {
  mode?: "test" | "production";
  limit?: number;
  contentUrls?: string[];
  contentLimit?: number;
  cdpEndpoint?: string;
  preferCdp?: boolean;
  allowFallbackAfterCdpFailure?: boolean;
  timeoutMs?: number;
  retryCount?: number;
  retryDelayMs?: number;
  headless?: boolean;
  sessionStatePath?: string;
  userDataDir?: string;
  allowPasswordLogin?: boolean;
  allowManualTakeover?: boolean;
  manualTimeoutMs?: number;
  freshnessMaxAgeHours?: number;
  freshnessRetryCount?: number;
  now?: Date;
  credentials?: XCredentials;
}

export interface RawTweetCard {
  text: string;
  quotedText?: string;
  quotedStatusUrl?: string;
  quotedExternalLinks?: string[];
  quotedCardText?: string;
  statusUrl: string;
  publishedAt?: string;
  externalLinks?: string[];
  cardText?: string;
}

export interface ScrapeForYouResult {
  stream: "for_you";
  authMethod: "cdp" | "session_reused" | "password_login" | "manual_takeover";
  cards: RawTweetCard[];
  attempt: number;
}

export interface ScrapeStatusCardsResult {
  cards: RawTweetCard[];
  attempt: number;
}
