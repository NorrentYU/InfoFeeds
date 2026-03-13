import { fetchTextWithRetry, FetchTextError } from "../telegram/http.js";
import { validateSubstackContent } from "./filters.js";
import { parseFeedXml } from "./rss.js";
import {
  buildFeedUrl,
  isFeedUrl,
  normalizeSourceUrl,
  sourceNameFromUrl,
} from "./url.js";
import type {
  FailureRecord,
  NormalizedRecord,
  SubstackFetchOptions,
  SubstackFetchResult,
  SubstackSource,
} from "./types.js";

function truncateDetail(detail: string): string {
  return detail.replace(/\s+/g, " ").trim().slice(0, 260);
}

function asErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function sourceNameOf(source: SubstackSource | string): string {
  if (typeof source === "string") {
    return sourceNameFromUrl(source);
  }
  return source.name || sourceNameFromUrl(source.url);
}

function sourceUrlOf(source: SubstackSource | string): string {
  if (typeof source === "string") {
    return source;
  }
  return source.url;
}

function failure(params: {
  sourceName: string;
  sourceUrl: string;
  feedUrl: string;
  failureType: FailureRecord["failure_type"];
  detail: string;
  retryable: boolean;
  attempt: number;
  articleUrl?: string;
}): FailureRecord {
  return {
    source_name: params.sourceName,
    source_url: params.sourceUrl,
    feed_url: params.feedUrl,
    article_url: params.articleUrl,
    occurred_at: new Date().toISOString(),
    failure_type: params.failureType,
    retryable: params.retryable,
    detail: truncateDetail(params.detail),
    attempt: params.attempt,
  };
}

export async function fetchSubstackSources(
  sources: Array<SubstackSource | string>,
  options: SubstackFetchOptions = {},
): Promise<SubstackFetchResult> {
  const now = options.now ?? new Date();
  const windowHours = options.windowHours ?? 24;
  const timeoutMs = options.timeoutMs ?? 15000;
  const retryCount = options.retryCount ?? 1;
  const retryDelayMs = options.retryDelayMs ?? 800;
  const maxItemsPerSource = options.maxItemsPerSource ?? 40;

  const records: NormalizedRecord[] = [];
  const failures: FailureRecord[] = [];
  const sinceMs = now.getTime() - windowHours * 60 * 60 * 1000;

  for (const source of sources) {
    const sourceUrlRaw = sourceUrlOf(source);
    const sourceName = sourceNameOf(source);

    const sourceUrl = normalizeSourceUrl(sourceUrlRaw);
    const feedUrl = buildFeedUrl(sourceUrlRaw);

    if (!sourceUrl || !feedUrl) {
      failures.push(
        failure({
          sourceName,
          sourceUrl: sourceUrlRaw,
          feedUrl: sourceUrlRaw,
          failureType: "parse",
          detail: "源URL无效，无法构造feed地址",
          retryable: false,
          attempt: 1,
        }),
      );
      continue;
    }

    let feedBody = "";
    try {
      const feed = await fetchTextWithRetry(feedUrl, {
        timeoutMs,
        retryCount,
        retryDelayMs,
      });
      feedBody = feed.body;
    } catch (error) {
      const retryable = error instanceof FetchTextError ? error.retryable : true;
      const attempt = error instanceof FetchTextError ? error.attempt : 1;
      failures.push(
        failure({
          sourceName,
          sourceUrl,
          feedUrl,
          failureType: "network",
          detail: `Feed拉取失败: ${asErrorMessage(error)}`,
          retryable,
          attempt,
        }),
      );
      continue;
    }

    const parsed = parseFeedXml({
      sourceUrl,
      feedUrl,
      xml: feedBody,
      maxItems: maxItemsPerSource,
    });

    for (const parseFailure of parsed.failures) {
      failures.push(
        failure({
          sourceName,
          sourceUrl,
          feedUrl,
          articleUrl: parseFailure.articleUrl,
          failureType: "parse",
          detail: parseFailure.detail,
          retryable: false,
          attempt: 1,
        }),
      );
    }

    if (parsed.entries.length === 0) {
      failures.push(
        failure({
          sourceName,
          sourceUrl,
          feedUrl,
          failureType: "no_updates",
          detail: `窗口 ${windowHours}h 内无可处理条目`,
          retryable: false,
          attempt: 1,
        }),
      );
      continue;
    }

    const seen = new Set<string>();
    let inWindowCount = 0;
    let sourceRecordCount = 0;

    for (const entry of parsed.entries) {
      const publishedMs = new Date(entry.publishedAt).getTime();
      if (Number.isNaN(publishedMs) || publishedMs < sinceMs) {
        continue;
      }
      inWindowCount += 1;

      const dedupeKey = entry.guid
        ? `guid:${entry.guid}`
        : `link:${entry.link}|${entry.publishedAt}`;
      if (seen.has(dedupeKey)) {
        continue;
      }
      seen.add(dedupeKey);

      if (isFeedUrl(entry.link)) {
        failures.push(
          failure({
            sourceName,
            sourceUrl,
            feedUrl,
            articleUrl: entry.link,
            failureType: "parse",
            detail: "条目链接指向feed而非原文",
            retryable: false,
            attempt: 1,
          }),
        );
        continue;
      }

      const validation = validateSubstackContent({ text: entry.content });
      if (!validation.valid) {
        failures.push(
          failure({
            sourceName,
            sourceUrl,
            feedUrl,
            articleUrl: entry.link,
            failureType: "invalid_content",
            detail: validation.reason,
            retryable: false,
            attempt: 1,
          }),
        );
        continue;
      }

      records.push({
        source_type: "substack",
        source_name: sourceName,
        title: entry.title,
        content: entry.content,
        url: entry.link,
        published_at: entry.publishedAt,
        fetched_at: now.toISOString(),
      });
      sourceRecordCount += 1;
    }

    if (inWindowCount === 0) {
      failures.push(
        failure({
          sourceName,
          sourceUrl,
          feedUrl,
          failureType: "no_updates",
          detail: `窗口 ${windowHours}h 内无更新证据`,
          retryable: false,
          attempt: 1,
        }),
      );
      continue;
    }

    if (sourceRecordCount === 0) {
      failures.push(
        failure({
          sourceName,
          sourceUrl,
          feedUrl,
          failureType: "invalid_content",
          detail: "窗口内条目存在，但正文均无效",
          retryable: false,
          attempt: 1,
        }),
      );
    }
  }

  return { records, failures };
}
