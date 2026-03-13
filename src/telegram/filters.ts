import { load } from "cheerio";

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function extractReadableContent(rawHtml: string): {
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
    if (content.length > 2000) {
      break;
    }
  }

  return { title, content };
}

export function validateExtractedContent(params: {
  rawHtml: string;
  title: string;
  content: string;
  minLength?: number;
}): { valid: true } | { valid: false; reason: string } {
  const minLength = params.minLength ?? 140;

  if (params.content.length < minLength) {
    return { valid: false, reason: `正文长度不足(${params.content.length})` };
  }

  return { valid: true };
}

export function validateTelegramTextContent(params: {
  text: string;
  minLength?: number;
}): { valid: true } | { valid: false; reason: string } {
  const minLength = params.minLength ?? 80;
  const normalized = normalizeWhitespace(params.text);

  if (!normalized) {
    return { valid: false, reason: "消息正文为空（可能仅图片）" };
  }

  if (normalized.length < minLength) {
    return { valid: false, reason: `消息正文长度不足(${normalized.length})` };
  }

  return { valid: true };
}

export function validateSubstackRssContent(params: {
  text: string;
  minLength?: number;
}): { valid: true } | { valid: false; reason: string } {
  const minLength = params.minLength ?? 140;
  const normalized = normalizeWhitespace(params.text);

  if (!normalized) {
    return { valid: false, reason: "RSS正文为空" };
  }

  if (normalized.length < minLength) {
    return { valid: false, reason: `RSS正文长度不足(${normalized.length})` };
  }

  return { valid: true };
}
