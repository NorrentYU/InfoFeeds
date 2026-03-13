import { load } from "cheerio";
import { htmlToText } from "./filters.js";
import { normalizeArticleUrl } from "./url.js";
import type { FeedEntry, ParsedFeedResult } from "./types.js";

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function extractLink(node: any): string {
  const linkText = normalizeWhitespace(node.find("link").first().text());
  if (linkText) {
    return linkText;
  }

  return (
    node.find("link[rel='alternate']").first().attr("href") ||
    node.find("link[href]").first().attr("href") ||
    ""
  );
}

function extractPublished(node: any): string {
  const candidates = [
    node.find("pubDate").first().text(),
    node.find("updated").first().text(),
    node.find("published").first().text(),
  ];

  for (const candidate of candidates) {
    const normalized = normalizeWhitespace(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return "";
}

function extractContent(node: any): string {
  const candidates = [
    node.find("content\\:encoded").first().text(),
    node.find("description").first().text(),
    node.find("content").first().text(),
    node.find("summary").first().text(),
  ];

  for (const candidate of candidates) {
    const normalized = normalizeWhitespace(candidate);
    if (normalized) {
      return htmlToText(normalized);
    }
  }

  return "";
}

function nodeGuid(node: any): string | undefined {
  const guid = normalizeWhitespace(node.find("guid").first().text());
  if (guid) {
    return guid;
  }

  const id = normalizeWhitespace(node.find("id").first().text());
  return id || undefined;
}

function nodeTitle(node: any): string {
  return normalizeWhitespace(node.find("title").first().text()) || "(无标题)";
}

function toIsoDate(raw: string): string | null {
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

export function parseFeedXml(params: {
  sourceUrl: string;
  feedUrl: string;
  xml: string;
  maxItems: number;
}): ParsedFeedResult {
  const $ = load(params.xml, {
    xmlMode: true,
  });

  const nodes = $("item").toArray();
  const atomNodes = nodes.length === 0 ? $("entry").toArray() : [];
  const activeNodes = nodes.length > 0 ? nodes : atomNodes;

  const entries: FeedEntry[] = [];
  const failures: ParsedFeedResult["failures"] = [];

  for (const rawNode of activeNodes) {
    const node = $(rawNode);
    const rawLink = extractLink(node);
    const link = normalizeArticleUrl(rawLink, params.sourceUrl);

    if (!link) {
      failures.push({ detail: `RSS条目链接无效: ${rawLink || "(empty)"}` });
      continue;
    }

    const publishedRaw = extractPublished(node);
    const publishedIso = toIsoDate(publishedRaw);
    if (!publishedIso) {
      failures.push({
        detail: `RSS条目时间无效: ${publishedRaw || "(empty)"}`,
        articleUrl: link,
      });
      continue;
    }

    const content = extractContent(node);
    const title = nodeTitle(node);

    entries.push({
      guid: nodeGuid(node),
      title,
      link,
      content,
      publishedAt: publishedIso,
    });

    if (entries.length >= params.maxItems) {
      break;
    }
  }

  return { entries, failures };
}
