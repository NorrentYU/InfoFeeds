import { load } from "cheerio";

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeProtocol(raw: string): string {
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

function isXHost(hostname: string): boolean {
  const lowered = hostname.toLowerCase();
  return (
    lowered === "x.com" ||
    lowered === "www.x.com" ||
    lowered === "twitter.com" ||
    lowered === "www.twitter.com" ||
    lowered === "mobile.twitter.com"
  );
}

function isXArticlePath(pathname: string): boolean {
  return (
    pathname.startsWith("/i/articles/") ||
    pathname.startsWith("/i/grok/share/") ||
    /^\/[^/]+\/article\/\d+(?:\/.*)?$/i.test(pathname)
  );
}

function canonicalizeXPath(pathname: string): string {
  const articleMatch = pathname.match(/^\/([^/]+)\/article\/(\d+)(?:\/.*)?$/i);
  if (articleMatch) {
    return `/${articleMatch[1]}/article/${articleMatch[2]}`;
  }

  const iArticleMatch = pathname.match(/^\/i\/articles\/(\d+)(?:\/.*)?$/i);
  if (iArticleMatch) {
    return `/i/articles/${iArticleMatch[1]}`;
  }

  return pathname;
}

function normalizeExternalLink(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = trimmed.startsWith("/")
      ? new URL(trimmed, "https://x.com")
      : new URL(normalizeProtocol(trimmed), "https://x.com");

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    if (isXHost(parsed.hostname)) {
      parsed.pathname = canonicalizeXPath(parsed.pathname);
    }
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function extractReadableContent(rawHtml: string): {
  title: string;
  content: string;
} {
  const $ = load(rawHtml);
  $("script, style, noscript, svg, iframe").remove();

  const title =
    normalizeWhitespace($("meta[property='og:title']").attr("content") || "") ||
    normalizeWhitespace($("title").first().text()) ||
    normalizeWhitespace($("h1").first().text());

  const selectors = [
    "article",
    "main",
    "[itemprop='articleBody']",
    ".entry-content",
    ".post-content",
    ".article-content",
    "section",
    "body",
  ];

  let content = "";
  for (const selector of selectors) {
    const candidate = normalizeWhitespace($(selector).first().text());
    if (candidate.length > content.length) {
      content = candidate;
    }
    if (content.length > 4000) {
      break;
    }
  }

  return { title, content };
}

function isBlockedXContent(content: string): boolean {
  const normalized = normalizeWhitespace(content).toLowerCase();
  return (
    normalized.includes("something went wrong, but don’t fret") ||
    normalized.includes("something went wrong, but don't fret") ||
    normalized.includes(
      "some privacy related extensions may cause issues on x.com",
    )
  );
}

function shouldRetryStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

async function fetchHtmlWithRetry(
  url: string,
  params: {
    timeoutMs: number;
    retryCount: number;
    retryDelayMs: number;
  },
): Promise<{ html: string; finalUrl: string } | null> {
  for (let attempt = 1; attempt <= params.retryCount + 1; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(params.timeoutMs),
        headers: {
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
          accept: "text/html,application/xhtml+xml",
        },
      });

      if (!response.ok) {
        if (
          attempt <= params.retryCount &&
          shouldRetryStatus(response.status)
        ) {
          await new Promise((resolve) =>
            setTimeout(resolve, params.retryDelayMs * attempt),
          );
          continue;
        }
        return null;
      }

      const finalUrl = response.url || url;
      const finalParsed = new URL(finalUrl);
      if (
        isXHost(finalParsed.hostname) &&
        !isXArticlePath(finalParsed.pathname)
      ) {
        return null;
      }

      const html = await response.text();
      return { html, finalUrl };
    } catch {
      if (attempt <= params.retryCount) {
        await new Promise((resolve) =>
          setTimeout(resolve, params.retryDelayMs * attempt),
        );
        continue;
      }
      return null;
    }
  }
  return null;
}

export async function fetchArticleFromLinks(
  links: string[],
  options: {
    timeoutMs?: number;
    retryCount?: number;
    retryDelayMs?: number;
    minLength?: number;
    maxCandidates?: number;
  } = {},
): Promise<{ title: string; content: string; url: string } | null> {
  const timeoutMs = options.timeoutMs ?? 8000;
  const retryCount = options.retryCount ?? 0;
  const retryDelayMs = options.retryDelayMs ?? 600;
  const minLength = options.minLength ?? 140;
  const maxCandidates = options.maxCandidates ?? 4;

  const candidates = Array.from(
    new Set(
      links
        .map((item) => normalizeExternalLink(item))
        .filter((item): item is string => Boolean(item)),
    ),
  ).slice(0, maxCandidates);

  for (const candidate of candidates) {
    let parsed: URL;
    try {
      parsed = new URL(candidate);
    } catch {
      continue;
    }
    if (isXHost(parsed.hostname) && !isXArticlePath(parsed.pathname)) {
      continue;
    }

    const fetched = await fetchHtmlWithRetry(candidate, {
      timeoutMs,
      retryCount,
      retryDelayMs,
    });
    if (!fetched) {
      continue;
    }

    const extracted = extractReadableContent(fetched.html);
    if (isBlockedXContent(extracted.content)) {
      continue;
    }
    if (extracted.content.length < minLength) {
      continue;
    }

    return {
      title: extracted.title,
      content: extracted.content,
      url: fetched.finalUrl,
    };
  }

  return null;
}

export async function fetchTweetTextFromOEmbed(
  statusUrl: string,
  options: {
    timeoutMs?: number;
    retryCount?: number;
    retryDelayMs?: number;
  } = {},
): Promise<{ text: string; links: string[] } | null> {
  const timeoutMs = options.timeoutMs ?? 3500;
  const retryCount = options.retryCount ?? 0;
  const retryDelayMs = options.retryDelayMs ?? 400;

  let normalizedStatusUrl = "";
  try {
    const parsed = new URL(normalizeProtocol(statusUrl), "https://x.com");
    const isStatusPath = /^\/[^/]+\/status\/\d+/i.test(parsed.pathname);
    if (!isXHost(parsed.hostname) || !isStatusPath) {
      return null;
    }
    parsed.hash = "";
    normalizedStatusUrl = parsed.toString();
  } catch {
    return null;
  }

  const endpoint = `https://publish.twitter.com/oembed?omit_script=1&url=${encodeURIComponent(normalizedStatusUrl)}`;

  for (let attempt = 1; attempt <= retryCount + 1; attempt += 1) {
    try {
      const response = await fetch(endpoint, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
          accept: "application/json,text/plain,*/*",
        },
      });
      if (!response.ok) {
        if (attempt <= retryCount && shouldRetryStatus(response.status)) {
          await new Promise((resolve) =>
            setTimeout(resolve, retryDelayMs * attempt),
          );
          continue;
        }
        return null;
      }

      const payload = (await response.json()) as { html?: string };
      const html = String(payload?.html || "");
      if (!html) {
        return null;
      }

      const $ = load(html);
      const text = normalizeWhitespace($("blockquote p").first().text() || "");
      const links = Array.from(
        new Set(
          $("blockquote p a[href]")
            .map((_, node) => normalizeExternalLink($(node).attr("href") || ""))
            .get()
            .filter((item): item is string => Boolean(item)),
        ),
      );

      if (!text && links.length === 0) {
        return null;
      }

      return { text, links };
    } catch {
      if (attempt <= retryCount) {
        await new Promise((resolve) =>
          setTimeout(resolve, retryDelayMs * attempt),
        );
        continue;
      }
      return null;
    }
  }

  return null;
}
