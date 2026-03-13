import { load } from "cheerio";

const PAYWALL_PATTERNS = [
  "this post is for paid subscribers",
  "this post is for subscribers",
  "become a paid subscriber",
  "become a member",
  "member-only",
  "upgrade to paid",
  "already a subscriber",
  "subscribe now",
  "continue reading",
  "sign in",
];

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function htmlToText(raw: string): string {
  const $ = load(raw);
  $("script, style, noscript, svg, iframe").remove();
  return normalizeWhitespace($.root().text());
}

function countMatches(text: string, patterns: string[]): number {
  const lowered = text.toLowerCase();
  return patterns.filter((pattern) => lowered.includes(pattern)).length;
}

export function validateOthersContent(params: {
  text: string;
  minLength?: number;
}): { valid: true } | { valid: false; reason: string } {
  const minLength = params.minLength ?? 140;
  const normalized = normalizeWhitespace(params.text);

  if (!normalized) {
    return { valid: false, reason: "正文为空" };
  }

  const paywallMatchCount = countMatches(normalized, PAYWALL_PATTERNS);
  if (paywallMatchCount >= 2) {
    return { valid: false, reason: "命中订阅墙提示文案" };
  }
  if (paywallMatchCount >= 1 && normalized.length < 500) {
    return { valid: false, reason: "正文疑似订阅墙摘要" };
  }

  if (normalized.length < minLength) {
    return { valid: false, reason: `正文长度不足(${normalized.length})` };
  }

  return { valid: true };
}
