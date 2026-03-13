import {
  scrapeForYouTimeline as scrapeForYouTimelineDefault,
  scrapeForYouViaCdp as scrapeForYouViaCdpDefault,
  scrapeStatusCardsViaCdp as scrapeStatusCardsViaCdpDefault,
  XBrowserError,
} from "./browser.js";
import {
  fetchArticleFromLinks as fetchArticleFromLinksDefault,
  fetchTweetTextFromOEmbed as fetchTweetTextFromOEmbedDefault,
} from "./article.js";
import { loadXCredentials as loadXCredentialsDefault } from "./env.js";
import { normalizeTweetText, validateTweetContent } from "./filters.js";
import { normalizeStatusUrl } from "./url.js";
import type {
  FailureRecord,
  NormalizedRecord,
  RawTweetCard,
  XFetchOptions,
  XFetchResult,
} from "./types.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function truncateDetail(detail: string): string {
  return detail.replace(/\s+/g, " ").trim().slice(0, 260);
}

function asErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function pickCardPreviewText(raw: string): string {
  const normalized = normalizeTweetText(raw);
  if (!normalized) {
    return "";
  }
  return normalized;
}

function previewTitleFromText(text: string): string {
  const normalized = normalizeTweetText(text);
  if (!normalized) {
    return "";
  }
  return normalized.slice(0, 80);
}

function inferQuoteFromCardPreview(params: {
  mainText: string;
  cardPreviewText: string;
}): string {
  const mainText = normalizeTweetText(params.mainText);
  const cardPreviewText = normalizeTweetText(params.cardPreviewText);
  if (!cardPreviewText) {
    return "";
  }
  if (!mainText) {
    return cardPreviewText;
  }
  if (cardPreviewText === mainText) {
    return "";
  }
  if (cardPreviewText.includes(mainText)) {
    const residue = normalizeTweetText(cardPreviewText.replace(mainText, ""));
    if (residue.length >= 24) {
      return residue;
    }
  }
  if (cardPreviewText.length - mainText.length >= 32) {
    return cardPreviewText;
  }
  return "";
}

function isXHostUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    return (
      host === "x.com" ||
      host === "www.x.com" ||
      host === "twitter.com" ||
      host === "www.twitter.com" ||
      host === "mobile.twitter.com"
    );
  } catch {
    return false;
  }
}

function isLikelyAdLandingContent(text: string): boolean {
  const normalized = normalizeTweetText(text).toLowerCase();
  if (!normalized || normalized.length < 800) {
    return false;
  }
  const patterns = [
    "shop now",
    "add to cart",
    "regular price",
    "sale price",
    "free shipping",
    "subscribe",
    "reviews",
    "size guide",
    "bundle",
    "buy now",
  ];
  const hitCount = patterns.filter((pattern) => normalized.includes(pattern)).length;
  return hitCount >= 2;
}

function shouldFilterForYouAd(params: {
  sourceName: string;
  outputUrl: string;
  content: string;
  card: RawTweetCard;
}): boolean {
  if (params.sourceName !== "for_you") {
    return false;
  }
  if (isXHostUrl(params.outputUrl)) {
    return false;
  }
  if (!params.card.publishedAt) {
    return true;
  }
  return isLikelyAdLandingContent(params.content);
}

function failure(params: {
  failureType: FailureRecord["failure_type"];
  detail: string;
  retryable: boolean;
  attempt: number;
  tweetUrl?: string;
  sourceName?: string;
  sourceUrl?: string;
}): FailureRecord {
  return {
    source_name: params.sourceName || "for_you",
    source_url: params.sourceUrl || "https://x.com/home",
    occurred_at: new Date().toISOString(),
    failure_type: params.failureType,
    retryable: params.retryable,
    detail: truncateDetail(params.detail),
    attempt: params.attempt,
    tweet_url: params.tweetUrl,
  };
}

async function convertCardsToOutput(params: {
  cards: RawTweetCard[];
  attempt: number;
  sourceName: string;
  sourceUrl: string;
  now: Date;
  limit: number;
  fetchArticleFromLinks: typeof fetchArticleFromLinksDefault;
  fetchTweetTextFromOEmbed: typeof fetchTweetTextFromOEmbedDefault;
}): Promise<XFetchResult> {
  const records: NormalizedRecord[] = [];
  const failures: FailureRecord[] = [];
  const seenStatus = new Set<string>();
  const seenOutputUrl = new Set<string>();

  for (const card of params.cards) {
    if (records.length >= params.limit) {
      break;
    }

    const normalizedUrl = normalizeStatusUrl(card.statusUrl);
    if (!normalizedUrl) {
      failures.push(
        failure({
          failureType: "parse",
          detail: "未提取到有效推文状态链接",
          retryable: false,
          attempt: params.attempt,
          sourceName: params.sourceName,
          sourceUrl: params.sourceUrl,
        }),
      );
      continue;
    }

    if (seenStatus.has(normalizedUrl)) {
      continue;
    }
    seenStatus.add(normalizedUrl);

    const combinedLinks = [
      ...(card.externalLinks || []),
      ...(card.quotedExternalLinks || []),
    ];
    let article = await params.fetchArticleFromLinks(combinedLinks, {
      timeoutMs: 3500,
      retryCount: 0,
      retryDelayMs: 600,
      minLength: 140,
      maxCandidates: 4,
    });

    const cardPreviewText = pickCardPreviewText(card.cardText || "");
    const hasMainTweetText = Boolean(normalizeTweetText(card.text || ""));
    const cardPreviewFallbackMinLength = hasMainTweetText ? 140 : 40;
    const preferredContent =
      article?.content ||
      (cardPreviewText.length >= cardPreviewFallbackMinLength
        ? cardPreviewText
        : "") ||
      card.text;
    const normalizedPreferred = normalizeTweetText(preferredContent);
    const inferredQuote = inferQuoteFromCardPreview({
      mainText: card.text,
      cardPreviewText,
    });
    const inferredQuoteFromQuotedCard = inferQuoteFromCardPreview({
      mainText: card.text,
      cardPreviewText: pickCardPreviewText(card.quotedCardText || ""),
    });
    const normalizedQuote = normalizeTweetText(
      card.quotedText || inferredQuoteFromQuotedCard || inferredQuote,
    );
    const mergedContent =
      normalizedQuote &&
      !normalizedPreferred.includes(normalizedQuote.slice(0, 80))
        ? `${normalizedPreferred}\n\n引用推文：${normalizedQuote}`
        : normalizedPreferred;
    let normalizedText = normalizeTweetText(mergedContent);
    if (!normalizedText) {
      const oembed = await params.fetchTweetTextFromOEmbed(normalizedUrl, {
        timeoutMs: 2800,
        retryCount: 0,
        retryDelayMs: 400,
      });
      if (oembed) {
        normalizedText = normalizeTweetText(oembed.text);
        if (!normalizedText && oembed.links.length > 0) {
          const oembedArticle = await params.fetchArticleFromLinks(oembed.links, {
            timeoutMs: 3500,
            retryCount: 0,
            retryDelayMs: 600,
            minLength: 120,
            maxCandidates: 3,
          });
          if (oembedArticle) {
            article = oembedArticle;
            normalizedText = normalizeTweetText(oembedArticle.content);
          }
        }
        if (!normalizedText && oembed.links.length > 0) {
          normalizedText = normalizeTweetText(oembed.links[0] || "");
        }
      }
    }
    const validation = validateTweetContent({ text: normalizedText });
    if (!validation.valid) {
      failures.push(
        failure({
          failureType: "invalid_content",
          detail: validation.reason,
          retryable: false,
          attempt: params.attempt,
          tweetUrl: normalizedUrl,
          sourceName: params.sourceName,
          sourceUrl: params.sourceUrl,
        }),
      );
      continue;
    }

    const outputUrl = article?.url || normalizedUrl;
    if (
      shouldFilterForYouAd({
        sourceName: params.sourceName,
        outputUrl,
        content: normalizedText,
        card,
      })
    ) {
      failures.push(
        failure({
          failureType: "invalid_content",
          detail: `疑似广告内容已过滤: ${outputUrl}`,
          retryable: false,
          attempt: params.attempt,
          tweetUrl: normalizedUrl,
          sourceName: params.sourceName,
          sourceUrl: params.sourceUrl,
        }),
      );
      continue;
    }

    if (seenOutputUrl.has(outputUrl)) {
      continue;
    }
    seenOutputUrl.add(outputUrl);

    const preferredTitle =
      article?.title ||
      (cardPreviewText.length >= 30
        ? previewTitleFromText(cardPreviewText)
        : "");
    records.push({
      source_type: "x",
      source_name: params.sourceName,
      title: normalizeTweetText(preferredTitle),
      content: normalizedText,
      url: outputUrl,
      published_at: card.publishedAt || params.now.toISOString(),
      fetched_at: params.now.toISOString(),
    });
  }

  if (records.length === 0 && failures.length === 0) {
    failures.push(
      failure({
        failureType: "no_updates",
        detail:
          params.sourceName === "x_content"
            ? "转交的 X 链接未提取到可用结果"
            : "For You 未提取到可用结果",
        retryable: false,
        attempt: params.attempt,
        sourceName: params.sourceName,
        sourceUrl: params.sourceUrl,
      }),
    );
  }

  return { records: records.slice(0, params.limit), failures };
}

async function runWithRetry<T>(params: {
  retryCount: number;
  retryDelayMs: number;
  runner: (attempt: number) => Promise<T>;
}): Promise<T> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= params.retryCount + 1; attempt += 1) {
    try {
      return await params.runner(attempt);
    } catch (error) {
      lastError = error;
      const retryable = error instanceof XBrowserError ? error.retryable : true;
      if (!retryable || attempt > params.retryCount) {
        throw error;
      }
      await sleep(params.retryDelayMs * attempt);
    }
  }

  throw lastError || new Error("unknown retry error");
}

function normalizeContentUrls(urls: string[]): string[] {
  return Array.from(
    new Set(
      urls
        .map((url) => normalizeStatusUrl(url))
        .filter((url): url is string => Boolean(url)),
    ),
  );
}

function isUrlOnlyText(text: string): boolean {
  const normalized = normalizeTweetText(text);
  if (!normalized) {
    return true;
  }
  return /^(https?:\/\/|www\.)\S+$/i.test(normalized);
}

function shouldRehydrateForYouCard(card: RawTweetCard): boolean {
  const text = normalizeTweetText(card.text || "");
  if (!text) {
    return true;
  }
  if (isUrlOnlyText(text)) {
    return true;
  }

  const links = card.externalLinks || [];
  const hasTcoLink = links.some((url) => /(?:^|\/\/)t\.co\//i.test(url));
  const hasXArticleLink = links.some(
    (url) =>
      /\/article\/\d+/i.test(url) ||
      /\/i\/articles\/\d+/i.test(url) ||
      /\/i\/grok\/share\//i.test(url),
  );
  if ((hasTcoLink || hasXArticleLink) && text.length < 80) {
    return true;
  }
  return false;
}

async function recoverEmptyForYouCards(params: {
  cards: RawTweetCard[];
  cdpEndpoint: string;
  scrapeStatusCardsViaCdp: typeof scrapeStatusCardsViaCdpDefault;
}): Promise<RawTweetCard[]> {
  const emptyStatusUrls = normalizeContentUrls(
    params.cards
      .filter((card) => shouldRehydrateForYouCard(card))
      .map((card) => card.statusUrl),
  );
  if (emptyStatusUrls.length === 0) {
    return params.cards;
  }

  try {
    const recovered = await params.scrapeStatusCardsViaCdp({
      cdpEndpoint: params.cdpEndpoint,
      statusUrls: emptyStatusUrls,
      attempt: 1,
    });
    if (recovered.cards.length === 0) {
      return params.cards;
    }

    const recoveredByStatus = new Map<string, RawTweetCard>();
    for (const card of recovered.cards) {
      const normalized = normalizeStatusUrl(card.statusUrl);
      if (!normalized || recoveredByStatus.has(normalized)) {
        continue;
      }
      recoveredByStatus.set(normalized, card);
    }

    return params.cards.map((card) => {
      if (!shouldRehydrateForYouCard(card)) {
        return card;
      }
      const normalized = normalizeStatusUrl(card.statusUrl);
      if (!normalized) {
        return card;
      }
      const recoveredCard = recoveredByStatus.get(normalized);
      if (!recoveredCard || !normalizeTweetText(recoveredCard.text || "")) {
        return card;
      }

      return {
        ...card,
        text: recoveredCard.text,
        publishedAt: card.publishedAt || recoveredCard.publishedAt,
        externalLinks: Array.from(
          new Set([
            ...(card.externalLinks || []),
            ...(recoveredCard.externalLinks || []),
          ]),
        ),
        cardText:
          (recoveredCard.cardText || "").length > (card.cardText || "").length
            ? recoveredCard.cardText
            : card.cardText,
      };
    });
  } catch {
    return params.cards;
  }
}

function mergeXResults(base: XFetchResult, extra: XFetchResult): XFetchResult {
  const seen = new Set(base.records.map((record) => record.url));
  const mergedRecords = [...base.records];
  for (const record of extra.records) {
    if (seen.has(record.url)) {
      continue;
    }
    seen.add(record.url);
    mergedRecords.push(record);
  }
  return {
    records: mergedRecords,
    failures: [...base.failures, ...extra.failures],
  };
}

async function appendXContentRecords(params: {
  base: XFetchResult;
  contentUrls: string[];
  contentLimit: number;
  cdpEndpoint: string;
  now: Date;
  scrapeStatusCardsViaCdp: typeof scrapeStatusCardsViaCdpDefault;
  fetchArticleFromLinks: typeof fetchArticleFromLinksDefault;
  fetchTweetTextFromOEmbed: typeof fetchTweetTextFromOEmbedDefault;
}): Promise<XFetchResult> {
  const normalizedUrls = normalizeContentUrls(params.contentUrls);
  if (normalizedUrls.length === 0 || params.contentLimit <= 0) {
    return params.base;
  }

  try {
    const cdpContent = await params.scrapeStatusCardsViaCdp({
      cdpEndpoint: params.cdpEndpoint,
      statusUrls: normalizedUrls,
      attempt: 1,
    });

    const converted = await convertCardsToOutput({
      cards: cdpContent.cards,
      attempt: cdpContent.attempt,
      sourceName: "x_content",
      sourceUrl: "https://x.com/home",
      now: params.now,
      limit: Math.min(params.contentLimit, normalizedUrls.length),
      fetchArticleFromLinks: params.fetchArticleFromLinks,
      fetchTweetTextFromOEmbed: params.fetchTweetTextFromOEmbed,
    });

    return mergeXResults(params.base, converted);
  } catch (error) {
    const normalized = error instanceof XBrowserError ? error : null;
    return mergeXResults(params.base, {
      records: [],
      failures: [
        failure({
          failureType: normalized ? normalized.failureType : "unexpected",
          detail: `x_content 抓取失败: ${normalized ? normalized.message : asErrorMessage(error)}`,
          retryable: normalized ? normalized.retryable : false,
          attempt: normalized ? normalized.attempt : 1,
          sourceName: "x_content",
          sourceUrl: "https://x.com/home",
        }),
      ],
    });
  }
}

export async function fetchXForYou(
  options: XFetchOptions = {},
  dependencies: {
    scrapeForYouViaCdp?: typeof scrapeForYouViaCdpDefault;
    scrapeStatusCardsViaCdp?: typeof scrapeStatusCardsViaCdpDefault;
    scrapeForYouTimeline?: typeof scrapeForYouTimelineDefault;
    loadXCredentials?: typeof loadXCredentialsDefault;
    fetchArticleFromLinks?: typeof fetchArticleFromLinksDefault;
    fetchTweetTextFromOEmbed?: typeof fetchTweetTextFromOEmbedDefault;
  } = {},
): Promise<XFetchResult> {
  const mode = options.mode ?? "test";
  const limit = options.limit ?? (mode === "production" ? 20 : 5);
  const contentUrls = options.contentUrls ?? [];
  const contentLimit = options.contentLimit ?? contentUrls.length;
  const rawLimit =
    mode === "test"
      ? Math.max(limit + 3, limit)
      : Math.max(limit * 2, limit + 5);
  const retryCount = options.retryCount ?? 1;
  const retryDelayMs = options.retryDelayMs ?? 1200;
  const timeoutMs = options.timeoutMs ?? 45000;
  const now = options.now ?? new Date();

  const preferCdp = options.preferCdp ?? true;
  const allowFallbackAfterCdpFailure =
    options.allowFallbackAfterCdpFailure ?? true;
  const cdpEndpoint =
    options.cdpEndpoint ||
    process.env.X_CDP_ENDPOINT ||
    "http://127.0.0.1:9222";

  const headless = options.headless ?? true;
  const sessionStatePath =
    options.sessionStatePath ?? ".cache/x/storage-state.json";
  const userDataDir = options.userDataDir ?? ".cache/x/profile";
  const allowPasswordLogin = options.allowPasswordLogin ?? true;
  const allowManualTakeover = options.allowManualTakeover ?? true;
  const manualTimeoutMs = options.manualTimeoutMs ?? 180000;
  const freshnessMaxAgeHours = options.freshnessMaxAgeHours ?? 24;
  const freshnessRetryCount = options.freshnessRetryCount ?? 3;

  const scrapeForYouViaCdp =
    dependencies.scrapeForYouViaCdp || scrapeForYouViaCdpDefault;
  const scrapeStatusCardsViaCdp =
    dependencies.scrapeStatusCardsViaCdp || scrapeStatusCardsViaCdpDefault;
  const scrapeForYouTimeline =
    dependencies.scrapeForYouTimeline || scrapeForYouTimelineDefault;
  const loadXCredentials =
    dependencies.loadXCredentials || loadXCredentialsDefault;
  const fetchArticleFromLinks =
    dependencies.fetchArticleFromLinks || fetchArticleFromLinksDefault;
  const fetchTweetTextFromOEmbed =
    dependencies.fetchTweetTextFromOEmbed || fetchTweetTextFromOEmbedDefault;

  let cdpFailure: FailureRecord | null = null;

  if (preferCdp) {
    try {
      const cdpResult = await runWithRetry({
        retryCount,
        retryDelayMs,
        runner: (attempt) =>
          scrapeForYouViaCdp({
            cdpEndpoint,
            limit: rawLimit,
            attempt,
            freshnessMaxAgeHours,
            freshnessRetryCount,
            now,
          }),
      });
      const recoveredCards = await recoverEmptyForYouCards({
        cards: cdpResult.cards,
        cdpEndpoint,
        scrapeStatusCardsViaCdp,
      });

      const converted = await convertCardsToOutput({
        cards: recoveredCards,
        attempt: cdpResult.attempt,
        sourceName: "for_you",
        sourceUrl: "https://x.com/home",
        now,
        limit,
        fetchArticleFromLinks,
        fetchTweetTextFromOEmbed,
      });
      return await appendXContentRecords({
        base: converted,
        contentUrls,
        contentLimit,
        cdpEndpoint,
        now,
        scrapeStatusCardsViaCdp,
        fetchArticleFromLinks,
        fetchTweetTextFromOEmbed,
      });
    } catch (error) {
      const normalized = error instanceof XBrowserError ? error : null;
      cdpFailure = failure({
        failureType: normalized ? normalized.failureType : "cdp_unavailable",
        detail: normalized ? normalized.message : asErrorMessage(error),
        retryable: normalized ? normalized.retryable : false,
        attempt: normalized ? normalized.attempt : 1,
      });

      if (!allowFallbackAfterCdpFailure) {
        return await appendXContentRecords({
          base: { records: [], failures: [cdpFailure] },
          contentUrls,
          contentLimit,
          cdpEndpoint,
          now,
          scrapeStatusCardsViaCdp,
          fetchArticleFromLinks,
          fetchTweetTextFromOEmbed,
        });
      }
    }
  }

  const credentials =
    options.credentials ||
    (allowPasswordLogin ? await loadXCredentials() : null);
  if (!credentials && allowPasswordLogin && !allowManualTakeover) {
    const authFailure = failure({
      failureType: "auth_config",
      detail:
        "未找到 X 登录凭证（支持 X_USERNAME/X_PASSWORD 或 USERNAME/PASSWORD）",
      retryable: false,
      attempt: 1,
    });
    return await appendXContentRecords({
      base: {
      records: [],
      failures: cdpFailure ? [cdpFailure, authFailure] : [authFailure],
      },
      contentUrls,
      contentLimit,
      cdpEndpoint,
      now,
      scrapeStatusCardsViaCdp,
      fetchArticleFromLinks,
      fetchTweetTextFromOEmbed,
    });
  }

  try {
    const fallbackResult = await runWithRetry({
      retryCount,
      retryDelayMs,
      runner: (attempt) =>
        scrapeForYouTimeline({
          username: credentials?.username,
          password: credentials?.password,
          limit: rawLimit,
          timeoutMs,
          headless,
          attempt,
          sessionStatePath,
          userDataDir,
          allowPasswordLogin,
          allowManualTakeover,
          manualTimeoutMs,
          freshnessMaxAgeHours,
          freshnessRetryCount,
          now,
        }),
    });
    const recoveredCards = await recoverEmptyForYouCards({
      cards: fallbackResult.cards,
      cdpEndpoint,
      scrapeStatusCardsViaCdp,
    });

    const converted = await convertCardsToOutput({
      cards: recoveredCards,
      attempt: fallbackResult.attempt,
      sourceName: "for_you",
      sourceUrl: "https://x.com/home",
      now,
      limit,
      fetchArticleFromLinks,
      fetchTweetTextFromOEmbed,
    });

    if (converted.records.length > 0) {
      return await appendXContentRecords({
        base: converted,
        contentUrls,
        contentLimit,
        cdpEndpoint,
        now,
        scrapeStatusCardsViaCdp,
        fetchArticleFromLinks,
        fetchTweetTextFromOEmbed,
      });
    }
    if (cdpFailure) {
      return await appendXContentRecords({
        base: {
        records: converted.records,
        failures: [cdpFailure, ...converted.failures],
        },
        contentUrls,
        contentLimit,
        cdpEndpoint,
        now,
        scrapeStatusCardsViaCdp,
        fetchArticleFromLinks,
        fetchTweetTextFromOEmbed,
      });
    }
    return await appendXContentRecords({
      base: converted,
      contentUrls,
      contentLimit,
      cdpEndpoint,
      now,
      scrapeStatusCardsViaCdp,
      fetchArticleFromLinks,
      fetchTweetTextFromOEmbed,
    });
  } catch (error) {
    const normalized = error instanceof XBrowserError ? error : null;
    const fallbackFailure = failure({
      failureType: normalized ? normalized.failureType : "unexpected",
      detail: normalized ? normalized.message : asErrorMessage(error),
      retryable: normalized ? normalized.retryable : false,
      attempt: normalized ? normalized.attempt : 1,
    });

    return await appendXContentRecords({
      base: {
      records: [],
      failures: cdpFailure ? [cdpFailure, fallbackFailure] : [fallbackFailure],
      },
      contentUrls,
      contentLimit,
      cdpEndpoint,
      now,
      scrapeStatusCardsViaCdp,
      fetchArticleFromLinks,
      fetchTweetTextFromOEmbed,
    });
  }
}
