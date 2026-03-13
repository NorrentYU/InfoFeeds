import { load } from "cheerio";
import { fetchTextWithRetry } from "./http.js";

interface RssEntry {
  title: string;
  link: string;
  content: string;
  publishedAt?: string;
}

export interface SubstackRssArticle {
  title: string;
  content: string;
  publishedAt?: string;
  feedUrl: string;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripTrailingSlash(pathname: string): string {
  if (pathname === "/") {
    return pathname;
  }
  return pathname.replace(/\/+$/, "") || "/";
}

function canonicalWithoutQuery(rawUrl: string): string {
  const parsed = new URL(rawUrl);
  parsed.hash = "";
  parsed.search = "";
  parsed.pathname = stripTrailingSlash(parsed.pathname);
  return parsed.toString();
}

function pathSegments(pathname: string): string[] {
  return pathname.split("/").filter(Boolean);
}

function htmlToText(rawHtml: string): string {
  const $ = load(rawHtml);
  $("script, style, noscript, svg, iframe").remove();
  return normalizeWhitespace($.root().text());
}

function contentFromNode(node: any): string {
  const candidates = [
    node.find("content").first().text(),
    node.find("content\\:encoded").first().text(),
    node.find("summary").first().text(),
    node.find("description").first().text(),
  ];

  for (const candidate of candidates) {
    const normalized = normalizeWhitespace(candidate);
    if (normalized) {
      return htmlToText(normalized);
    }
  }

  return "";
}

function parseFeedEntries(rawXml: string): RssEntry[] {
  const $ = load(rawXml, { xmlMode: true });
  const entries: RssEntry[] = [];

  $("entry").each((_, entry) => {
    const node = $(entry);
    const link =
      node.find("link[rel='alternate']").first().attr("href") ||
      node.find("link[href]").first().attr("href") ||
      "";
    const title = normalizeWhitespace(node.find("title").first().text());
    const content = contentFromNode(node);
    const publishedAt =
      normalizeWhitespace(node.find("updated").first().text()) ||
      normalizeWhitespace(node.find("published").first().text()) ||
      undefined;

    if (link && content) {
      entries.push({ title, link, content, publishedAt });
    }
  });

  $("item").each((_, item) => {
    const node = $(item);
    const link = normalizeWhitespace(node.find("link").first().text());
    const title = normalizeWhitespace(node.find("title").first().text());
    const content = contentFromNode(node);
    const publishedAt =
      normalizeWhitespace(node.find("pubDate").first().text()) || undefined;

    if (link && content) {
      entries.push({ title, link, content, publishedAt });
    }
  });

  return entries;
}

function likelySubstackByUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.hostname.toLowerCase().endsWith("substack.com")) {
      return true;
    }

    const segments = pathSegments(parsed.pathname);
    if (segments[0] === "p" && segments.length >= 2) {
      return true;
    }

    const utmSource = parsed.searchParams.get("utm_source")?.toLowerCase();
    return utmSource === "substack";
  } catch {
    return false;
  }
}

export function isSubstackArticleUrl(rawUrl: string): boolean {
  return likelySubstackByUrl(rawUrl);
}

function feedCandidatesFor(rawArticleUrl: string): string[] {
  const parsed = new URL(rawArticleUrl);
  const originFeed = `${parsed.origin}/feed`;
  return [originFeed];
}

function slugFromPath(pathname: string): string {
  const segments = pathSegments(pathname);
  const pIndex = segments.indexOf("p");
  if (pIndex >= 0 && segments[pIndex + 1]) {
    return segments[pIndex + 1];
  }
  return segments[segments.length - 1] || "";
}

function matchEntry(articleUrl: string, entries: RssEntry[]): RssEntry | null {
  const target = new URL(articleUrl);
  const targetCanonical = canonicalWithoutQuery(articleUrl);
  const targetSlug = slugFromPath(target.pathname);

  for (const entry of entries) {
    try {
      const entryCanonical = canonicalWithoutQuery(entry.link);
      if (entryCanonical === targetCanonical) {
        return entry;
      }

      const entryUrl = new URL(entry.link);
      if (
        entryUrl.hostname.toLowerCase() === target.hostname.toLowerCase() &&
        stripTrailingSlash(entryUrl.pathname) ===
          stripTrailingSlash(target.pathname)
      ) {
        return entry;
      }

      if (targetSlug && slugFromPath(entryUrl.pathname) === targetSlug) {
        return entry;
      }
    } catch {
      // ignore unparsable entry URLs
    }
  }

  return null;
}

export async function fetchSubstackArticleFromRss(
  articleUrl: string,
  options: {
    timeoutMs: number;
    retryCount: number;
    retryDelayMs: number;
  },
): Promise<SubstackRssArticle | null> {
  if (!isSubstackArticleUrl(articleUrl)) {
    return null;
  }

  const candidates = feedCandidatesFor(articleUrl);

  for (const feedUrl of candidates) {
    try {
      const feed = await fetchTextWithRetry(feedUrl, {
        timeoutMs: options.timeoutMs,
        retryCount: options.retryCount,
        retryDelayMs: options.retryDelayMs,
      });

      const entries = parseFeedEntries(feed.body);
      if (entries.length === 0) {
        continue;
      }

      const matched = matchEntry(articleUrl, entries);
      if (!matched) {
        continue;
      }

      return {
        title: matched.title,
        content: matched.content,
        publishedAt: matched.publishedAt,
        feedUrl,
      };
    } catch {
      // fall through and try next candidate
    }
  }

  return null;
}
