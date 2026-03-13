import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright";
import type { RawTweetCard, ScrapeForYouResult } from "./types.js";

type BrowserFailureType =
  | "cdp_unavailable"
  | "cdp_context_missing"
  | "cdp_not_logged_in"
  | "login_failed"
  | "login_challenge"
  | "flow_mismatch"
  | "stale_feed"
  | "network"
  | "parse";

export class XBrowserError extends Error {
  readonly failureType: BrowserFailureType;
  readonly retryable: boolean;
  readonly attempt: number;

  constructor(
    message: string,
    options: {
      failureType: BrowserFailureType;
      retryable: boolean;
      attempt: number;
    },
  ) {
    super(message);
    this.name = "XBrowserError";
    this.failureType = options.failureType;
    this.retryable = options.retryable;
    this.attempt = options.attempt;
  }
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function asErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

async function hasChallengeSignals(page: Page): Promise<string | null> {
  const bodyText = normalizeWhitespace(
    await page.evaluate(() => document.body?.innerText || ""),
  ).toLowerCase();
  const patternHits = [
    "security challenge",
    "verify your identity",
    "prove you're human",
    "complete the challenge",
    "unusual activity",
    "not a robot",
    "安全验证",
    "完成验证",
    "验证你的身份",
  ].filter((pattern) => bodyText.includes(pattern));
  if (patternHits.length > 0) {
    return `challenge patterns: ${patternHits.join(",")}`;
  }

  const challengeFrameCount = await page
    .locator(
      "iframe[src*='captcha'], iframe[src*='arkoselabs'], iframe[src*='hcaptcha'], iframe[src*='recaptcha']",
    )
    .count();
  if (challengeFrameCount > 0) {
    return "challenge iframe detected";
  }

  return null;
}

async function hasErrorPageSignals(page: Page): Promise<string | null> {
  const result = await page.evaluate(() => {
    const innerText = (document.body?.innerText || "").toLowerCase();
    const tweetCount = document.querySelectorAll(
      "article[data-testid='tweet']",
    ).length;
    const hasErrorContainer = Boolean(
      document.querySelector(".errorContainer"),
    );
    const hasKnownErrorText =
      innerText.includes("something went wrong") ||
      innerText.includes("try again") ||
      innerText.includes("出现错误") ||
      innerText.includes("重试");
    return { tweetCount, hasErrorContainer, hasKnownErrorText };
  });

  if (
    (result.hasErrorContainer || result.hasKnownErrorText) &&
    result.tweetCount === 0
  ) {
    return "error container or known error text without tweet cards";
  }

  return null;
}

async function clickButtonByName(
  page: Page,
  names: RegExp[],
): Promise<boolean> {
  for (const pattern of names) {
    const locator = page.getByRole("button", { name: pattern }).first();
    if (await locator.isVisible().catch(() => false)) {
      await locator.click({ timeout: 5000 });
      return true;
    }
  }
  return false;
}

async function ensureForYouSelected(page: Page): Promise<boolean> {
  const forYouTab = page
    .getByRole("tab", { name: /(For you|For You|为你推荐|推薦|ForYou)/i })
    .first();
  const followingTab = page
    .getByRole("tab", { name: /(Following|正在关注|追蹤中)/i })
    .first();

  if (!(await forYouTab.isVisible().catch(() => false))) {
    return false;
  }

  const selectedBefore = await forYouTab.getAttribute("aria-selected");
  if (selectedBefore !== "true") {
    await forYouTab.click({ timeout: 5000 });
  }

  const selectedAfter = await forYouTab.getAttribute("aria-selected");
  if (selectedAfter !== "true") {
    return false;
  }

  const followingSelected = await followingTab
    .getAttribute("aria-selected")
    .catch(() => null);
  if (followingSelected === "true") {
    return false;
  }

  return true;
}

function toAbsoluteStatusUrl(statusPath: string): string {
  if (/^https?:\/\//i.test(statusPath)) {
    return statusPath;
  }
  return `https://x.com${statusPath}`;
}

function toStatusPath(rawUrl: string): string | null {
  const match =
    rawUrl.match(
      /^https?:\/\/(?:www\.)?(?:x\.com|twitter\.com|www\.twitter\.com|mobile\.twitter\.com)\/([^/]+)\/status\/(\d+)/i,
    ) || rawUrl.match(/^\/([^/]+)\/status\/(\d+)/i);
  if (!match) {
    return null;
  }
  return `/${match[1]}/status/${match[2]}`;
}

function isBlockedXContent(text: string): boolean {
  const normalized = text.toLowerCase();
  return (
    normalized.includes("something went wrong, but don’t fret") ||
    normalized.includes("something went wrong, but don't fret") ||
    normalized.includes(
      "some privacy related extensions may cause issues on x.com",
    )
  );
}

function toCanonicalArticlePath(rawUrl: string): string | null {
  const userArticleMatch =
    rawUrl.match(
      /^https?:\/\/(?:www\.)?(?:x\.com|twitter\.com|www\.twitter\.com|mobile\.twitter\.com)\/([^/]+)\/article\/(\d+)/i,
    ) || rawUrl.match(/^\/([^/]+)\/article\/(\d+)/i);
  if (userArticleMatch) {
    return `/${userArticleMatch[1]}/article/${userArticleMatch[2]}`;
  }

  const iArticleMatch =
    rawUrl.match(
      /^https?:\/\/(?:www\.)?(?:x\.com|twitter\.com|www\.twitter\.com|mobile\.twitter\.com)\/i\/articles\/(\d+)/i,
    ) || rawUrl.match(/^\/i\/articles\/(\d+)/i);
  if (iArticleMatch) {
    return `/i/articles/${iArticleMatch[1]}`;
  }

  return null;
}

function pickCanonicalArticlePath(links: string[]): string | null {
  for (const link of links) {
    const path = toCanonicalArticlePath(link);
    if (path) {
      return path;
    }
  }
  return null;
}

async function pullXArticleTextFromPath(
  page: Page,
  articlePath: string,
): Promise<string | null> {
  const articlePage = await page.context().newPage();
  try {
    await articlePage.goto(toAbsoluteStatusUrl(articlePath), {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    await articlePage.waitForTimeout(1500);

    const articleText = normalizeWhitespace(
      await articlePage.evaluate(() => {
        const main = document.querySelector("main");
        if (!main) {
          return "";
        }
        return (main as HTMLElement).innerText || main.textContent || "";
      }),
    );

    if (
      !articleText ||
      articleText.length < 120 ||
      isBlockedXContent(articleText)
    ) {
      return null;
    }

    return articleText;
  } catch {
    return null;
  } finally {
    await articlePage.close().catch(() => {});
  }
}

async function discoverQuotedStatusUrl(
  page: Page,
  mainStatusUrl: string,
): Promise<string | null> {
  const statusPage = await page.context().newPage();
  try {
    await statusPage.goto(toAbsoluteStatusUrl(mainStatusUrl), {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    await statusPage.waitForFunction(
      () =>
        document.querySelectorAll("article[data-testid='tweet']").length > 0,
      null,
      { timeout: 8000 },
    );

    const clicked = await statusPage.evaluate((targetRaw) => {
      const targetPath = String(targetRaw || "");
      const targetIdMatch = targetPath.match(/\/status\/(\d+)/i);
      const targetId = targetIdMatch ? targetIdMatch[1] : "";

      const articles = Array.from(
        document.querySelectorAll("article[data-testid='tweet']"),
      );
      const targetArticle =
        articles.find((article) => {
          if (!targetId) {
            return false;
          }
          return Array.from(article.querySelectorAll("a[href]")).some(
            (node) => {
              const href = node.getAttribute("href") || "";
              const match = href.match(/\/status\/(\d+)/i);
              return Boolean(match && match[1] === targetId);
            },
          );
        }) || articles[0];

      if (!targetArticle) {
        return false;
      }

      const mainText = (
        targetArticle.querySelector("[data-testid='tweetText']")?.textContent ||
        ""
      )
        .replace(/\s+/g, " ")
        .trim();

      const candidates = Array.from(
        targetArticle.querySelectorAll("[role='link']"),
      )
        .map((node) => ({
          node,
          text: (node.textContent || "").replace(/\s+/g, " ").trim(),
        }))
        .filter(
          (item) =>
            item.text.length >= 40 &&
            item.text !== mainText &&
            (item.text.includes("@") ||
              item.text.includes("文章") ||
              item.text.toLowerCase().includes("article")),
        );

      if (candidates.length === 0) {
        return false;
      }

      const picked = candidates.sort(
        (a, b) => b.text.length - a.text.length,
      )[0];
      if (!picked) {
        return false;
      }

      const element = picked.node as HTMLElement;
      if (typeof element.click === "function") {
        element.click();
        return true;
      }

      return false;
    }, mainStatusUrl);

    if (!clicked) {
      return null;
    }

    const beforeUrl = statusPage.url();
    await statusPage
      .waitForURL(
        (url) =>
          url.href !== beforeUrl &&
          (/\/status\/\d+/i.test(url.pathname) ||
            /\/article\/\d+/i.test(url.pathname)),
        { timeout: 4000 },
      )
      .catch(() => null);

    return toStatusPath(statusPage.url());
  } catch {
    return null;
  } finally {
    await statusPage.close().catch(() => {});
  }
}

async function pullQuotedTweetDetails(
  page: Page,
  quotedStatusUrl: string,
): Promise<{
  text: string;
  externalLinks: string[];
  cardText: string;
  publishedAt?: string;
} | null> {
  const statusPage = await page.context().newPage();
  try {
    await statusPage.goto(toAbsoluteStatusUrl(quotedStatusUrl), {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    await statusPage
      .waitForFunction(
        () => {
          const articleCount = document.querySelectorAll(
            "article[data-testid='tweet']",
          ).length;
          if (articleCount > 0) {
            return true;
          }
          const mainText = (document.querySelector("main")?.innerText || "")
            .replace(/\s+/g, " ")
            .trim();
          return mainText.length > 120;
        },
        null,
        { timeout: 27000 },
      )
      .catch(() => {});
    await statusPage.waitForTimeout(2100);

    await statusPage
      .$$eval("article[data-testid='tweet']", (articles) => {
        const showMorePatterns = ["show more", "显示更多", "展开", "顯示更多"];
        for (const article of articles) {
          const candidates = Array.from(
            article.querySelectorAll(
              "[data-testid='tweet-text-show-more-link'], a, div[role='button'], span",
            ),
          );
          for (const node of candidates) {
            const text = (node.textContent || "").trim().toLowerCase();
            if (!text) {
              continue;
            }
            if (!showMorePatterns.some((pattern) => text === pattern)) {
              continue;
            }
            const element = node as HTMLElement;
            if (typeof element.click === "function") {
              element.click();
            }
          }
        }
      })
      .catch(() => {});
    await statusPage.waitForTimeout(360);

    const details = await statusPage.$$eval(
      "article[data-testid='tweet']",
      (articles, targetPathRaw) => {
        const targetPath = String(targetPathRaw || "");
        const targetIdMatch = targetPath.match(/\/status\/(\d+)/i);
        const targetId = targetIdMatch ? targetIdMatch[1] : "";

        const targetArticle =
          articles.find((article) => {
            const matched = Array.from(
              article.querySelectorAll("a[href]"),
            ).some((node) => {
              const href = node.getAttribute("href") || "";
              const match = href.match(/\/status\/(\d+)/i);
              if (!match) {
                return false;
              }
              if (!targetId) {
                return true;
              }
              return match[1] === targetId;
            });
            return matched;
          }) || articles[0];

        if (!targetArticle) {
          return null;
        }

        const tweetTextNodes = Array.from(
          targetArticle.querySelectorAll("[data-testid='tweetText']"),
        );
        const tweetText = tweetTextNodes
          .map((node) => (node.textContent || "").replace(/\s+/g, " ").trim())
          .filter(Boolean)
          .join("\n\n");

        const semanticNodes = Array.from(
          targetArticle.querySelectorAll(
            "div[lang], span[lang], div[dir='auto'], span[dir='auto']",
          ),
        );
        const semanticText = Array.from(
          new Set(
            semanticNodes
              .map((node) => (node.textContent || "").replace(/\s+/g, " ").trim())
              .filter((item) => item.length >= 8),
          ),
        ).join(" ");

        const rawArticleText = (
          (targetArticle as HTMLElement).innerText ||
          targetArticle.textContent ||
          ""
        ).trim();
        const noisePatterns = [
          /^show more$/i,
          /^显示更多$/i,
          /^展开$/i,
          /^replying to/i,
          /^引用推文$/i,
          /^translate post$/i,
          /^翻译推文$/i,
          /^查看新帖子$/i,
          /^对话$/i,
          /^推广$/i,
          /^premium$/i,
        ];
        const fallbackLines = rawArticleText
          .split(/\n+/)
          .map((line) => line.replace(/\s+/g, " ").trim())
          .filter(
            (line) =>
              line.length >= 8 &&
              !noisePatterns.some((pattern) => pattern.test(line)),
          );
        const rawFallbackText = fallbackLines.join(" ");

        let text = tweetText || semanticText || "";
        if (
          rawFallbackText &&
          ((!text && rawFallbackText.length >= 40) ||
            (text.length < 160 &&
              rawFallbackText.length > Math.max(220, text.length + 120)))
        ) {
          text = rawFallbackText;
        }
        if (!text) {
          text = rawFallbackText || semanticText || tweetText;
        }
        const publishedAt =
          targetArticle.querySelector("time")?.getAttribute("datetime") || "";

        const orderedLinks = [
          ...Array.from(
            targetArticle.querySelectorAll(
              "[data-testid='card.wrapper'] a[href]",
            ),
          ),
          ...Array.from(targetArticle.querySelectorAll("a[href]")),
        ]
          .map((node) => node.getAttribute("href") || "")
          .filter(Boolean);

        const externalLinks: string[] = [];
        const seen = new Set<string>();
        for (const candidate of orderedLinks) {
          if (!candidate || seen.has(candidate)) {
            continue;
          }
          seen.add(candidate);
          const lowered = candidate.toLowerCase();
          if (
            lowered.startsWith("mailto:") ||
            lowered.startsWith("javascript:") ||
            lowered.startsWith("tel:")
          ) {
            continue;
          }
          externalLinks.push(candidate);
        }

        const cardNodes = Array.from(
          targetArticle.querySelectorAll(
            "[data-testid='card.wrapper'], [data-testid*='card']",
          ),
        );
        const cardText =
          cardNodes
            .map((node) =>
              ((node as HTMLElement).innerText || node.textContent || "")
                .replace(/\s+/g, " ")
                .trim(),
            )
            .filter(Boolean)
            .sort((a, b) => b.length - a.length)[0] || "";

        return {
          text,
          externalLinks,
          cardText,
          publishedAt,
        };
      },
      quotedStatusUrl,
    );

    if (!details) {
      return null;
    }

    const enriched = {
      text: details.text,
      externalLinks: details.externalLinks,
      cardText: details.cardText,
      publishedAt: details.publishedAt || "",
    };

    if (!enriched.text) {
      const articlePath = pickCanonicalArticlePath(enriched.externalLinks);
      if (articlePath) {
        const articleText = await pullXArticleTextFromPath(page, articlePath);
        if (articleText) {
          enriched.text = articleText;
        }
      }
    }

    return enriched;
  } catch {
    return null;
  } finally {
    await statusPage.close().catch(() => {});
  }
}

async function pullQuotedTweetDetailsWithRetry(
  page: Page,
  quotedStatusUrl: string,
): Promise<{
  text: string;
  externalLinks: string[];
  cardText: string;
  publishedAt?: string;
} | null> {
  // 产品要求：任一推文状态链接只尝试一次抓取，不做重试。
  return pullQuotedTweetDetails(page, quotedStatusUrl);
}

async function hydrateQuotedCards(
  page: Page,
  cards: RawTweetCard[],
): Promise<void> {
  const cache = new Map<
    string,
    {
      text: string;
      externalLinks: string[];
      cardText: string;
    } | null
  >();
  const discoveredStatusCache = new Map<string, string | null>();
  let discoveredAttempts = 0;
  const maxDiscoverAttempts = 3;

  for (const card of cards) {
    if (
      !card.quotedStatusUrl &&
      card.quotedCardText &&
      discoveredAttempts < maxDiscoverAttempts
    ) {
      if (!discoveredStatusCache.has(card.statusUrl)) {
        const discoveredStatusUrl = await discoverQuotedStatusUrl(
          page,
          card.statusUrl,
        );
        discoveredAttempts += 1;
        discoveredStatusCache.set(card.statusUrl, discoveredStatusUrl);
      }
      const discoveredStatusUrl =
        discoveredStatusCache.get(card.statusUrl) || null;
      if (discoveredStatusUrl) {
        card.quotedStatusUrl = discoveredStatusUrl;
      }
    }

    if (!card.quotedStatusUrl) {
      continue;
    }

    if (!cache.has(card.quotedStatusUrl)) {
      const details = await pullQuotedTweetDetailsWithRetry(
        page,
        card.quotedStatusUrl,
      );
      cache.set(card.quotedStatusUrl, details);
    }

    const details = cache.get(card.quotedStatusUrl) || null;
    if (!details) {
      continue;
    }

    const currentQuotedLength = (card.quotedText || "").length;
    if (details.text && details.text.length > currentQuotedLength) {
      card.quotedText = details.text;
    }

    const mergedQuotedLinks = Array.from(
      new Set([...(card.quotedExternalLinks || []), ...details.externalLinks]),
    );
    card.quotedExternalLinks = mergedQuotedLinks;

    if (
      details.cardText &&
      details.cardText.length > (card.quotedCardText || "").length
    ) {
      card.quotedCardText = details.cardText;
    }
  }
}

async function hydrateMainArticleCards(
  page: Page,
  cards: RawTweetCard[],
): Promise<void> {
  const articleTextCache = new Map<string, string | null>();

  for (const card of cards) {
    if (card.text) {
      continue;
    }

    const articlePath = pickCanonicalArticlePath(card.externalLinks || []);
    if (!articlePath) {
      continue;
    }

    if (!articleTextCache.has(articlePath)) {
      const articleText = await pullXArticleTextFromPath(page, articlePath);
      articleTextCache.set(articlePath, articleText);
    }

    const articleText = articleTextCache.get(articlePath) || null;
    if (!articleText) {
      continue;
    }

    card.text = articleText;
    if (!card.cardText) {
      card.cardText = articleText;
    }
  }
}

async function collectTweetCards(
  page: Page,
  limit: number,
): Promise<RawTweetCard[]> {
  const cards: RawTweetCard[] = [];
  const seen = new Set<string>();
  let stagnantRounds = 0;

  while (cards.length < limit && stagnantRounds < 12) {
    await page
      .$$eval("article[data-testid='tweet']", (articles) => {
        const showMorePatterns = ["show more", "显示更多", "展开", "顯示更多"];
        for (const article of articles) {
          const candidates = Array.from(
            article.querySelectorAll(
              "[data-testid='tweet-text-show-more-link'], a, div[role='button'], span",
            ),
          );
          for (const node of candidates) {
            const text = (node.textContent || "").trim().toLowerCase();
            if (!text) {
              continue;
            }
            if (!showMorePatterns.some((pattern) => text === pattern)) {
              continue;
            }
            const element = node as HTMLElement;
            if (typeof element.click === "function") {
              element.click();
            }
          }
        }
      })
      .catch(() => {});
    await page.waitForTimeout(120);

    const snapshot = await page.$$eval(
      "article[data-testid='tweet']",
      (articles) =>
        articles.map((article) => {
          const tweetTextNodes = Array.from(
            article.querySelectorAll("[data-testid='tweetText']"),
          );
          const text = (tweetTextNodes[0]?.textContent || "")
            .replace(/\s+/g, " ")
            .trim();
          let quotedText = tweetTextNodes
            .slice(1)
            .map((node) => (node.textContent || "").replace(/\s+/g, " ").trim())
            .filter(Boolean)
            .join("\n\n");
          let quotedCardText = "";

          const timeNode = article.querySelector("time");
          const publishedAt = timeNode
            ? timeNode.getAttribute("datetime") || ""
            : "";

          const statusPaths = Array.from(article.querySelectorAll("a[href]"));
          const uniqueStatusPaths = Array.from(
            new Set(
              statusPaths.map((node) => {
                const href = node.getAttribute("href") || "";
                const match = href.match(/^\/([^/]+)\/status\/(\d+)/i);
                if (!match) {
                  return "";
                }
                return `/${match[1]}/status/${match[2]}`;
              }),
            ),
          ).filter(Boolean);
          const href = uniqueStatusPaths[0] || "";
          const quotedStatusUrl = uniqueStatusPaths[1] || "";

          if (!quotedText && uniqueStatusPaths.length > 1) {
            const articleText = (
              (article as HTMLElement).innerText ||
              article.textContent ||
              ""
            )
              .replace(/\s+/g, " ")
              .trim();
            const quoteCandidates: string[] = [];
            for (const quoteStatusPath of uniqueStatusPaths.slice(1)) {
              const quoteAnchors = Array.from(
                article.querySelectorAll("a[href]"),
              )
                .filter((node) =>
                  (node.getAttribute("href") || "").includes(quoteStatusPath),
                )
                .slice(0, 4);

              for (const anchor of quoteAnchors) {
                const container =
                  anchor.closest("[role='link']") || anchor.closest("div");
                if (!container) {
                  continue;
                }
                const rawContainerText = (
                  (container as HTMLElement).innerText ||
                  container.textContent ||
                  ""
                )
                  .replace(/\s+/g, " ")
                  .trim();
                if (!rawContainerText || rawContainerText === articleText) {
                  continue;
                }

                const textNodes = Array.from(
                  container.querySelectorAll(
                    "[data-testid='tweetText'], div[lang], span[lang], div[dir='auto'], span[dir='auto']",
                  ),
                );
                const semanticText = textNodes
                  .map((node) => node.textContent || "")
                  .join(" ")
                  .trim()
                  .replace(/\s+/g, " ");
                const candidate =
                  semanticText.length >= 24 ? semanticText : rawContainerText;
                if (!candidate || candidate === text || candidate.length < 24) {
                  continue;
                }
                quoteCandidates.push(candidate);
              }
            }

            quotedText =
              quoteCandidates.sort((a, b) => b.length - a.length)[0] || "";
          }

          if (!quotedText) {
            const roleLinkCandidates = Array.from(
              article.querySelectorAll("[role='link']"),
            )
              .map((node) =>
                ((node as HTMLElement).innerText || node.textContent || "")
                  .replace(/\s+/g, " ")
                  .trim(),
              )
              .filter(
                (candidate) =>
                  candidate.length >= 40 &&
                  candidate !== text &&
                  (candidate.includes("@") ||
                    candidate.includes("文章") ||
                    candidate.toLowerCase().includes("article")),
              );

            const bestRoleLinkCandidate =
              roleLinkCandidates.sort((a, b) => b.length - a.length)[0] || "";
            if (bestRoleLinkCandidate) {
              quotedText = bestRoleLinkCandidate;
              quotedCardText = bestRoleLinkCandidate;
            }
          }

          const orderedLinks = [
            ...Array.from(
              article.querySelectorAll("[data-testid='card.wrapper'] a[href]"),
            ),
            ...Array.from(article.querySelectorAll("a[href]")),
          ]
            .map((node) => node.getAttribute("href") || "")
            .filter(Boolean);

          const externalLinks: string[] = [];
          const seenExternal = new Set<string>();
          for (const candidate of orderedLinks) {
            if (!candidate || seenExternal.has(candidate)) {
              continue;
            }
            seenExternal.add(candidate);
            const lowered = candidate.toLowerCase();
            if (
              lowered.startsWith("mailto:") ||
              lowered.startsWith("javascript:") ||
              lowered.startsWith("tel:")
            ) {
              continue;
            }
            externalLinks.push(candidate);
          }

          const cardNodes = Array.from(
            article.querySelectorAll(
              "[data-testid='card.wrapper'], [data-testid*='card']",
            ),
          );
          const cardText =
            cardNodes
              .map((node) =>
                ((node as HTMLElement).innerText || node.textContent || "")
                  .replace(/\s+/g, " ")
                  .trim(),
              )
              .filter(Boolean)
              .sort((a, b) => b.length - a.length)[0] || "";

          return {
            text,
            quotedText,
            quotedCardText,
            quotedStatusUrl,
            statusUrl: href,
            publishedAt,
            externalLinks,
            cardText,
          };
        }),
    );

    const sizeBefore = cards.length;
    for (const item of snapshot) {
      const key = `${item.statusUrl}|${item.publishedAt}|${item.text.slice(0, 40)}|${(item.externalLinks || []).slice(0, 2).join(",")}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      cards.push({
        text: item.text,
        quotedText: item.quotedText || "",
        quotedCardText: item.quotedCardText || "",
        quotedStatusUrl: item.quotedStatusUrl || undefined,
        statusUrl: item.statusUrl,
        publishedAt: item.publishedAt || undefined,
        externalLinks: item.externalLinks || [],
        cardText: item.cardText || "",
      });
      if (cards.length >= limit) {
        break;
      }
    }

    if (cards.length === sizeBefore) {
      stagnantRounds += 1;
    } else {
      stagnantRounds = 0;
    }

    await page.mouse.wheel(0, 2200);
    await page.waitForTimeout(900);
  }

  const outputCards = cards.slice(0, limit);
  await hydrateQuotedCards(page, outputCards);
  await hydrateMainArticleCards(page, outputCards);
  return outputCards;
}

function isFeedStale(params: {
  cards: RawTweetCard[];
  now: Date;
  freshnessMaxAgeHours: number;
}): boolean {
  const publishedMs = params.cards
    .map((card) =>
      card.publishedAt ? new Date(card.publishedAt).getTime() : Number.NaN,
    )
    .filter((value) => Number.isFinite(value)) as number[];
  if (publishedMs.length === 0) {
    return false;
  }

  const newest = Math.max(...publishedMs);
  const ageMs = params.now.getTime() - newest;
  return ageMs > params.freshnessMaxAgeHours * 60 * 60 * 1000;
}

async function scrapeWithFreshness(params: {
  page: Page;
  limit: number;
  now: Date;
  freshnessMaxAgeHours: number;
  freshnessRetryCount: number;
  attempt: number;
}): Promise<RawTweetCard[]> {
  for (
    let refreshAttempt = 0;
    refreshAttempt <= params.freshnessRetryCount;
    refreshAttempt += 1
  ) {
    const cards = await collectTweetCards(params.page, params.limit);

    const challenge = await hasChallengeSignals(params.page);
    if (challenge) {
      throw new XBrowserError(`抓取过程中触发挑战: ${challenge}`, {
        failureType: "login_challenge",
        retryable: false,
        attempt: params.attempt,
      });
    }

    if (
      cards.length > 0 &&
      !isFeedStale({
        cards,
        now: params.now,
        freshnessMaxAgeHours: params.freshnessMaxAgeHours,
      })
    ) {
      return cards;
    }

    if (refreshAttempt < params.freshnessRetryCount) {
      await params.page.reload({ waitUntil: "domcontentloaded" });
      await params.page.waitForTimeout(1100);
      const forYouOk = await ensureForYouSelected(params.page);
      if (!forYouOk) {
        throw new XBrowserError("刷新后未能确认当前流为 For You", {
          failureType: "flow_mismatch",
          retryable: false,
          attempt: params.attempt,
        });
      }
    }
  }

  throw new XBrowserError(
    `For You 内容超过 ${params.freshnessMaxAgeHours}h 且刷新重试 ${params.freshnessRetryCount} 次后仍未恢复`,
    {
      failureType: "stale_feed",
      retryable: false,
      attempt: params.attempt,
    },
  );
}

async function persistSession(
  context: BrowserContext,
  storageStatePath?: string,
): Promise<void> {
  if (!storageStatePath) {
    return;
  }
  await mkdir(dirname(storageStatePath), { recursive: true });
  await context.storageState({ path: storageStatePath });
}

async function attemptPasswordLogin(params: {
  page: Page;
  username: string;
  password: string;
  timeoutMs: number;
  attempt: number;
}): Promise<void> {
  await params.page.goto("https://x.com/i/flow/login", {
    waitUntil: "domcontentloaded",
  });
  const loginChallenge = await hasChallengeSignals(params.page);
  if (loginChallenge) {
    throw new XBrowserError(`登录页触发挑战: ${loginChallenge}`, {
      failureType: "login_challenge",
      retryable: false,
      attempt: params.attempt,
    });
  }

  const usernameInput = params.page.locator("input[name='text']").first();
  await usernameInput.waitFor({ state: "visible", timeout: params.timeoutMs });
  await usernameInput.fill(params.username);
  const nextClicked = await clickButtonByName(params.page, [
    /next/i,
    /下一步/,
    /下一个/,
  ]);
  if (!nextClicked) {
    await usernameInput.press("Enter");
  }

  await params.page.waitForTimeout(1200);
  const challengeAfterUsername = await hasChallengeSignals(params.page);
  if (challengeAfterUsername) {
    throw new XBrowserError(`用户名阶段触发挑战: ${challengeAfterUsername}`, {
      failureType: "login_challenge",
      retryable: false,
      attempt: params.attempt,
    });
  }

  const extraIdentifierInput = params.page
    .locator("input[name='text']")
    .first();
  if (await extraIdentifierInput.isVisible().catch(() => false)) {
    const passwordFieldVisible = await params.page
      .locator("input[name='password']")
      .isVisible()
      .catch(() => false);
    if (!passwordFieldVisible) {
      await extraIdentifierInput.fill(params.username);
      const nextClickedAgain = await clickButtonByName(params.page, [
        /next/i,
        /下一步/,
        /下一个/,
      ]);
      if (!nextClickedAgain) {
        await extraIdentifierInput.press("Enter");
      }
    }
  }

  const passwordInput = params.page.locator("input[name='password']").first();
  try {
    await passwordInput.waitFor({
      state: "visible",
      timeout: params.timeoutMs,
    });
  } catch {
    throw new XBrowserError("未出现密码输入框，登录流程异常", {
      failureType: "login_failed",
      retryable: false,
      attempt: params.attempt,
    });
  }
  await passwordInput.fill(params.password);
  const loginClicked = await clickButtonByName(params.page, [
    /log in/i,
    /登录/,
    /登入/,
  ]);
  if (!loginClicked) {
    await passwordInput.press("Enter");
  }
}

async function waitForManualTakeover(params: {
  page: Page;
  timeoutMs: number;
  attempt: number;
}): Promise<void> {
  console.log(
    `[X] 人工接管已开启。请在当前受控浏览器中完成挑战/登录，${Math.floor(
      params.timeoutMs / 1000,
    )} 秒内完成。`,
  );
  const startedAt = Date.now();
  let lastChallenge: string | null = null;

  while (Date.now() - startedAt < params.timeoutMs) {
    const challenge = await hasChallengeSignals(params.page);
    if (challenge) {
      lastChallenge = challenge;
    }
    const forYouReady = await ensureForYouSelected(params.page);
    if (forYouReady) {
      return;
    }
    await params.page.waitForTimeout(1500);
  }

  throw new XBrowserError(
    `人工接管超时，未完成登录/挑战${lastChallenge ? `: ${lastChallenge}` : ""}`,
    {
      failureType: "login_challenge",
      retryable: false,
      attempt: params.attempt,
    },
  );
}

async function launchIsolatedContext(params: {
  userDataDir: string;
  headless: boolean;
  timeoutMs: number;
}): Promise<{ context: BrowserContext; page: Page }> {
  await mkdir(params.userDataDir, { recursive: true });
  const context = await chromium.launchPersistentContext(params.userDataDir, {
    headless: params.headless,
    viewport: { width: 1400, height: 1100 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
  });
  const pages = context.pages();
  const page = pages[0] || (await context.newPage());
  page.setDefaultTimeout(params.timeoutMs);
  return { context, page };
}

export async function scrapeForYouViaCdp(params: {
  cdpEndpoint?: string;
  limit: number;
  attempt?: number;
  freshnessMaxAgeHours?: number;
  freshnessRetryCount?: number;
  now?: Date;
}): Promise<ScrapeForYouResult> {
  const endpoint =
    params.cdpEndpoint || process.env.X_CDP_ENDPOINT || "http://127.0.0.1:9222";
  const attempt = params.attempt ?? 1;
  const freshnessMaxAgeHours = params.freshnessMaxAgeHours ?? 24;
  const freshnessRetryCount = params.freshnessRetryCount ?? 3;
  const now = params.now ?? new Date();

  let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | null =
    null;
  try {
    browser = await chromium.connectOverCDP(endpoint);
    const contexts = browser.contexts();
    if (contexts.length === 0) {
      throw new XBrowserError("CDP 已连接但未发现浏览器上下文", {
        failureType: "cdp_context_missing",
        retryable: false,
        attempt,
      });
    }

    const context =
      contexts.find((ctx) =>
        ctx.pages().some((page) => page.url().includes("x.com")),
      ) || contexts[0];
    const existingXPage = context
      .pages()
      .find((item) => item.url().includes("x.com"));
    const page = existingXPage || (await context.newPage());
    if (!page.url().includes("x.com")) {
      await page.goto("https://x.com/home", { waitUntil: "domcontentloaded" });
    }
    await page.bringToFront().catch(() => {});
    await page.waitForTimeout(1200);

    const errorPage = await hasErrorPageSignals(page);
    if (errorPage) {
      throw new XBrowserError(`CDP 已连接但页面处于错误态: ${errorPage}`, {
        failureType: "cdp_not_logged_in",
        retryable: false,
        attempt,
      });
    }

    const forYouReady = await ensureForYouSelected(page);
    if (!forYouReady) {
      const challenge = await hasChallengeSignals(page);
      const detail = challenge
        ? `CDP 已连接但登录态不可用: ${challenge}`
        : "CDP 已连接但未确认 For You 登录态";
      throw new XBrowserError(detail, {
        failureType: "cdp_not_logged_in",
        retryable: false,
        attempt,
      });
    }

    const cards = await scrapeWithFreshness({
      page,
      limit: params.limit,
      now,
      freshnessMaxAgeHours,
      freshnessRetryCount,
      attempt,
    });

    return {
      stream: "for_you",
      authMethod: "cdp",
      cards,
      attempt,
    };
  } catch (error) {
    if (error instanceof XBrowserError) {
      throw error;
    }

    const message = asErrorMessage(error);
    const cdpUnavailable =
      message.includes("ECONNREFUSED") ||
      message.includes("ECONNRESET") ||
      message.includes("connectOverCDP") ||
      message.includes("ws preparing");
    throw new XBrowserError(message, {
      failureType: cdpUnavailable ? "cdp_unavailable" : "network",
      retryable: cdpUnavailable,
      attempt,
    });
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

export async function scrapeStatusCardsViaCdp(params: {
  cdpEndpoint?: string;
  statusUrls: string[];
  attempt?: number;
}): Promise<{ cards: RawTweetCard[]; attempt: number }> {
  const endpoint =
    params.cdpEndpoint || process.env.X_CDP_ENDPOINT || "http://127.0.0.1:9222";
  const attempt = params.attempt ?? 1;
  const statusPaths = Array.from(
    new Set(params.statusUrls.map((url) => toStatusPath(url) || "").filter(Boolean)),
  );
  if (statusPaths.length === 0) {
    return { cards: [], attempt };
  }

  let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | null =
    null;
  try {
    browser = await chromium.connectOverCDP(endpoint);
    const contexts = browser.contexts();
    if (contexts.length === 0) {
      throw new XBrowserError("CDP 已连接但未发现浏览器上下文", {
        failureType: "cdp_context_missing",
        retryable: false,
        attempt,
      });
    }

    const context =
      contexts.find((ctx) =>
        ctx.pages().some((page) => page.url().includes("x.com")),
      ) || contexts[0];
    const existingXPage = context
      .pages()
      .find((item) => item.url().includes("x.com"));
    const page = existingXPage || (await context.newPage());
    if (!page.url().includes("x.com")) {
      await page.goto("https://x.com/home", { waitUntil: "domcontentloaded" });
    }
    await page.bringToFront().catch(() => {});
    await page.waitForTimeout(800);

    const errorPage = await hasErrorPageSignals(page);
    if (errorPage) {
      throw new XBrowserError(`CDP 已连接但页面处于错误态: ${errorPage}`, {
        failureType: "cdp_not_logged_in",
        retryable: false,
        attempt,
      });
    }

    const challenge = await hasChallengeSignals(page);
    if (challenge) {
      throw new XBrowserError(`CDP 已连接但登录态不可用: ${challenge}`, {
        failureType: "cdp_not_logged_in",
        retryable: false,
        attempt,
      });
    }

    const cards: RawTweetCard[] = [];
    for (const statusPath of statusPaths) {
      const details = await pullQuotedTweetDetailsWithRetry(page, statusPath);
      if (!details) {
        continue;
      }
      cards.push({
        text: details.text || "",
        statusUrl: statusPath,
        publishedAt: details.publishedAt || undefined,
        externalLinks: details.externalLinks || [],
        cardText: details.cardText || "",
      });
    }

    return { cards, attempt };
  } catch (error) {
    if (error instanceof XBrowserError) {
      throw error;
    }

    const message = asErrorMessage(error);
    const cdpUnavailable =
      message.includes("ECONNREFUSED") ||
      message.includes("ECONNRESET") ||
      message.includes("connectOverCDP") ||
      message.includes("ws preparing");
    throw new XBrowserError(message, {
      failureType: cdpUnavailable ? "cdp_unavailable" : "network",
      retryable: cdpUnavailable,
      attempt,
    });
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

export async function scrapeForYouTimeline(params: {
  username?: string;
  password?: string;
  limit: number;
  timeoutMs?: number;
  headless?: boolean;
  attempt?: number;
  sessionStatePath?: string;
  userDataDir?: string;
  allowPasswordLogin?: boolean;
  allowManualTakeover?: boolean;
  manualTimeoutMs?: number;
  freshnessMaxAgeHours?: number;
  freshnessRetryCount?: number;
  now?: Date;
}): Promise<ScrapeForYouResult> {
  const timeoutMs = params.timeoutMs ?? 45000;
  const attempt = params.attempt ?? 1;
  const headless = params.headless ?? true;
  const allowPasswordLogin = params.allowPasswordLogin ?? true;
  const allowManualTakeover = params.allowManualTakeover ?? false;
  const manualTimeoutMs = params.manualTimeoutMs ?? 180000;
  const freshnessMaxAgeHours = params.freshnessMaxAgeHours ?? 24;
  const freshnessRetryCount = params.freshnessRetryCount ?? 3;
  const userDataDir = params.userDataDir ?? ".cache/x/profile";
  const now = params.now ?? new Date();

  let context: BrowserContext | null = null;
  try {
    const launched = await launchIsolatedContext({
      userDataDir,
      headless,
      timeoutMs,
    });
    context = launched.context;
    const page = launched.page;

    // Phase 1: session-first
    await page.goto("https://x.com/home", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(900);
    const firstChallenge = await hasChallengeSignals(page);
    const sessionForYou = !firstChallenge && (await ensureForYouSelected(page));
    if (sessionForYou) {
      const cards = await scrapeWithFreshness({
        page,
        limit: params.limit,
        now,
        freshnessMaxAgeHours,
        freshnessRetryCount,
        attempt,
      });
      await persistSession(context, params.sessionStatePath);
      return {
        stream: "for_you",
        authMethod: "session_reused",
        cards,
        attempt,
      };
    }

    // Phase 2: password recovery
    if (allowPasswordLogin && params.username && params.password) {
      try {
        await attemptPasswordLogin({
          page,
          username: params.username,
          password: params.password,
          timeoutMs,
          attempt,
        });
        await page.goto("https://x.com/home", {
          waitUntil: "domcontentloaded",
        });
        await page.waitForTimeout(1200);
        const postLoginChallenge = await hasChallengeSignals(page);
        if (postLoginChallenge) {
          throw new XBrowserError(`登录后触发挑战: ${postLoginChallenge}`, {
            failureType: "login_challenge",
            retryable: false,
            attempt,
          });
        }
        const forYouReady = await ensureForYouSelected(page);
        if (!forYouReady) {
          throw new XBrowserError("未能确认当前流为 For You", {
            failureType: "flow_mismatch",
            retryable: false,
            attempt,
          });
        }
        const cards = await scrapeWithFreshness({
          page,
          limit: params.limit,
          now,
          freshnessMaxAgeHours,
          freshnessRetryCount,
          attempt,
        });
        await persistSession(context, params.sessionStatePath);
        return {
          stream: "for_you",
          authMethod: "password_login",
          cards,
          attempt,
        };
      } catch (error) {
        if (
          !(
            error instanceof XBrowserError &&
            error.failureType === "login_challenge" &&
            allowManualTakeover
          )
        ) {
          throw error;
        }
      }
    }

    // Phase 3: manual takeover (same controlled profile/context)
    if (allowManualTakeover) {
      if (headless) {
        await context.close();
        context = null;
        const launchedHeadful = await launchIsolatedContext({
          userDataDir,
          headless: false,
          timeoutMs,
        });
        context = launchedHeadful.context;
        const manualPage = launchedHeadful.page;
        await manualPage.goto("https://x.com/home", {
          waitUntil: "domcontentloaded",
        });
        await waitForManualTakeover({
          page: manualPage,
          timeoutMs: manualTimeoutMs,
          attempt,
        });
        const cards = await scrapeWithFreshness({
          page: manualPage,
          limit: params.limit,
          now,
          freshnessMaxAgeHours,
          freshnessRetryCount,
          attempt,
        });
        await persistSession(context, params.sessionStatePath);
        return {
          stream: "for_you",
          authMethod: "manual_takeover",
          cards,
          attempt,
        };
      }

      await waitForManualTakeover({
        page,
        timeoutMs: manualTimeoutMs,
        attempt,
      });
      const cards = await scrapeWithFreshness({
        page,
        limit: params.limit,
        now,
        freshnessMaxAgeHours,
        freshnessRetryCount,
        attempt,
      });
      await persistSession(context, params.sessionStatePath);
      return {
        stream: "for_you",
        authMethod: "manual_takeover",
        cards,
        attempt,
      };
    }

    throw new XBrowserError("会话失效且未启用可用登录恢复路径", {
      failureType: "login_failed",
      retryable: false,
      attempt,
    });
  } catch (error) {
    if (error instanceof XBrowserError) {
      throw error;
    }
    throw new XBrowserError(asErrorMessage(error), {
      failureType: "network",
      retryable: true,
      attempt,
    });
  } finally {
    if (context) {
      await context.close();
    }
  }
}
