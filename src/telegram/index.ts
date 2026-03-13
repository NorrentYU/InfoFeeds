import { fetchTextWithRetry, FetchTextError } from "./http.js";
import {
  extractReadableContent,
  validateExtractedContent,
  validateTelegramTextContent,
  validateSubstackRssContent,
} from "./filters.js";
import { fetchChannelMessages } from "./fetcher.js";
import { normalizeUrl, telegramSourceName } from "./url.js";
import { fetchXFallbackContent, isXUrl } from "./x-fallback.js";
import {
  fetchSubstackArticleFromRss,
  isSubstackArticleUrl,
} from "./substack-rss.js";
import type {
  FailureRecord,
  NormalizedRecord,
  TelegramFetchOptions,
  TelegramFetchResult,
  TelegramSource,
  XContentHandoff,
} from "./types.js";

function truncateDetail(detail: string): string {
  return detail.replace(/\s+/g, " ").trim().slice(0, 240);
}

function failure(params: {
  sourceName: string;
  sourceUrl: string;
  failureType: FailureRecord["failure_type"];
  detail: string;
  retryable: boolean;
  attempt: number;
  messageUrl?: string;
  externalUrl?: string;
}): FailureRecord {
  return {
    source_name: params.sourceName,
    source_url: params.sourceUrl,
    message_url: params.messageUrl,
    external_url: params.externalUrl,
    occurred_at: new Date().toISOString(),
    failure_type: params.failureType,
    retryable: params.retryable,
    detail: truncateDetail(params.detail),
    attempt: params.attempt,
  };
}

function sourceNameOf(source: TelegramSource | string): string {
  if (typeof source === "string") {
    return telegramSourceName(source);
  }
  return source.name || telegramSourceName(source.url);
}

function sourceUrlOf(source: TelegramSource | string): string {
  if (typeof source === "string") {
    return source;
  }
  return source.url;
}

function asErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export async function fetchTelegramSources(
  sources: Array<TelegramSource | string>,
  options: TelegramFetchOptions = {},
): Promise<TelegramFetchResult> {
  const now = options.now ?? new Date();
  const windowHours = options.windowHours ?? 24;
  const timeoutMs = options.timeoutMs ?? 15000;
  const retryCount = options.retryCount ?? 1;
  const retryDelayMs = options.retryDelayMs ?? 800;
  const maxMessagesPerSource = options.maxMessagesPerSource ?? 20;

  const records: NormalizedRecord[] = [];
  const failures: FailureRecord[] = [];
  const xContentHandoffs: XContentHandoff[] = [];
  const seenUrl = new Set<string>();
  const seenTextMessage = new Set<string>();

  for (const source of sources) {
    const sourceUrl = sourceUrlOf(source);
    const sourceName = sourceNameOf(source);

    let messages;
    try {
      messages = await fetchChannelMessages({
        sourceUrl,
        now,
        windowHours,
        timeoutMs,
        retryCount,
        retryDelayMs,
        maxMessagesPerSource,
      });
    } catch (error) {
      const retryable =
        error instanceof FetchTextError ? error.retryable : true;
      const attempt = error instanceof FetchTextError ? error.attempt : 1;
      failures.push(
        failure({
          sourceName,
          sourceUrl,
          failureType: "network",
          detail: `频道抓取失败: ${asErrorMessage(error)}`,
          retryable,
          attempt,
        }),
      );
      continue;
    }

    if (messages.length === 0) {
      failures.push(
        failure({
          sourceName,
          sourceUrl,
          failureType: "no_updates",
          detail: `窗口 ${windowHours}h 内无可处理消息`,
          retryable: false,
          attempt: 1,
        }),
      );
      continue;
    }

    for (const message of messages) {
      if (message.externalLinks.length === 0) {
        const dedupeKey =
          message.messageUrl ||
          `${sourceName}:${message.publishedAt}:${message.messageText}`;
        if (seenTextMessage.has(dedupeKey)) {
          continue;
        }
        seenTextMessage.add(dedupeKey);

        const textValidation = validateTelegramTextContent({
          text: message.messageText,
        });

        if (textValidation.valid) {
          records.push({
            source_type: "telegram",
            source_name: sourceName,
            title: message.messageTitle,
            content: message.messageText,
            url: "",
            published_at: message.publishedAt,
            fetched_at: now.toISOString(),
          });

          failures.push(
            failure({
              sourceName,
              sourceUrl,
              messageUrl: message.messageUrl,
              failureType: "no_external_link",
              detail: "消息无外链，已降级使用消息正文（url置空）",
              retryable: false,
              attempt: 1,
            }),
          );
          continue;
        }

        failures.push(
          failure({
            sourceName,
            sourceUrl,
            messageUrl: message.messageUrl,
            failureType: "no_external_link",
            detail: `消息不包含外链，且${textValidation.reason}，跳过`,
            retryable: false,
            attempt: 1,
          }),
        );
        continue;
      }

      for (const link of message.externalLinks) {
        const normalized = normalizeUrl(link);
        if (!normalized || seenUrl.has(normalized)) {
          continue;
        }
        seenUrl.add(normalized);

        if (isXUrl(normalized)) {
          xContentHandoffs.push({
            source_name: sourceName,
            source_url: sourceUrl,
            message_url: message.messageUrl,
            x_url: normalized,
            published_at: message.publishedAt,
            occurred_at: now.toISOString(),
          });
          failures.push(
            failure({
              sourceName,
              sourceUrl,
              messageUrl: message.messageUrl,
              externalUrl: normalized,
              failureType: "x_content",
              detail: "X 链接已转交 X 模块处理（source_name=x_content）",
              retryable: false,
              attempt: 1,
            }),
          );
          continue;
        }

        if (isSubstackArticleUrl(normalized)) {
          const rssArticle = await fetchSubstackArticleFromRss(normalized, {
            timeoutMs,
            retryCount,
            retryDelayMs,
          });

          if (rssArticle) {
            const rssValidation = validateSubstackRssContent({
              text: rssArticle.content,
              minLength: 140,
            });

            if (rssValidation.valid) {
              records.push({
                source_type: "telegram",
                source_name: sourceName,
                title: rssArticle.title || message.messageTitle,
                content: rssArticle.content,
                url: normalized,
                published_at: message.publishedAt,
                fetched_at: now.toISOString(),
              });
              continue;
            }

            failures.push(
              failure({
                sourceName,
                sourceUrl,
                messageUrl: message.messageUrl,
                externalUrl: normalized,
                failureType: "invalid_content",
                detail: `Substack RSS正文无效: ${rssValidation.reason}`,
                retryable: false,
                attempt: 1,
              }),
            );
            continue;
          }
        }

        let rawHtml = "";
        let finalUrl = normalized;
        let fetchAttempt = 1;

        try {
          const fetched = await fetchTextWithRetry(normalized, {
            timeoutMs,
            retryCount,
            retryDelayMs,
          });
          rawHtml = fetched.body;
          finalUrl = fetched.finalUrl;
          fetchAttempt = fetched.attempt;
        } catch (error) {
          const retryable =
            error instanceof FetchTextError ? error.retryable : true;
          const attempt = error instanceof FetchTextError ? error.attempt : 1;
          failures.push(
            failure({
              sourceName,
              sourceUrl,
              messageUrl: message.messageUrl,
              externalUrl: normalized,
              failureType: "network",
              detail: `外链抓取失败: ${asErrorMessage(error)}`,
              retryable,
              attempt,
            }),
          );
          continue;
        }

        const extracted = extractReadableContent(rawHtml);
        const validation = validateExtractedContent({
          rawHtml,
          title: extracted.title,
          content: extracted.content,
        });

        if (!validation.valid) {
          if (isXUrl(finalUrl)) {
            try {
              const fallback = await fetchXFallbackContent({
                originalUrl: finalUrl,
                timeoutMs,
                retryCount,
                retryDelayMs,
              });

              if (fallback) {
                records.push({
                  source_type: "telegram",
                  source_name: sourceName,
                  title:
                    fallback.title || extracted.title || message.messageTitle,
                  content: fallback.content,
                  url: finalUrl,
                  published_at: message.publishedAt,
                  fetched_at: now.toISOString(),
                });
                continue;
              }
            } catch (fallbackError) {
              failures.push(
                failure({
                  sourceName,
                  sourceUrl,
                  messageUrl: message.messageUrl,
                  externalUrl: finalUrl,
                  failureType: "network",
                  detail: `X 外链兜底抓取失败: ${asErrorMessage(fallbackError)}`,
                  retryable: true,
                  attempt: 1,
                }),
              );
              continue;
            }
          }

          failures.push(
            failure({
              sourceName,
              sourceUrl,
              messageUrl: message.messageUrl,
              externalUrl: finalUrl,
              failureType: "invalid_content",
              detail: validation.reason,
              retryable: false,
              attempt: fetchAttempt,
            }),
          );
          continue;
        }

        records.push({
          source_type: "telegram",
          source_name: sourceName,
          title: extracted.title || message.messageTitle,
          content: extracted.content,
          url: finalUrl,
          published_at: message.publishedAt,
          fetched_at: now.toISOString(),
        });
      }
    }
  }

  return { records, failures, x_content_handoffs: xContentHandoffs };
}
