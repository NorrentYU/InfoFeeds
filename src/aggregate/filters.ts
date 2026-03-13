import type { NormalizedRecord } from "./types.js";

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function buildFallbackTitle(title: string, content: string): string {
  const cleanTitle = normalizeWhitespace(title);
  if (cleanTitle) {
    return cleanTitle;
  }

  const contentTitle = normalizeWhitespace(content)
    .replace(/[。！？!?].*$/, "")
    .replace(/^[#\s]+/, "");
  if (contentTitle) {
    return contentTitle;
  }
  return "内容摘要";
}

function buildFallbackBody(content: string): string {
  const normalized = normalizeWhitespace(content);
  if (!normalized) {
    return "";
  }
  if (normalized.length <= 320) {
    return normalized;
  }
  return `${normalized.slice(0, 320)}...`;
}

function stripCodeFence(summary: string): string {
  let output = summary.trim();
  output = output.replace(/^```(?:markdown|md)?\s*/i, "");
  output = output.replace(/\s*```$/, "");
  return output.trim();
}

function sanitizeTitle(raw: string): string {
  let output = raw
    .replace(/\*\*/g, "")
    .replace(/^#+\s*/, "")
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .trim();

  output = output.replace(/^标题[\s:：-]*/i, "").trim();
  output = output.replace(/（你基于内容[^）]*）/g, "").trim();
  output = output.replace(/\(你基于内容[^)]*\)/g, "").trim();
  output = output.replace(/^[：:]+/, "").trim();

  const invalid = [
    "标题",
    "摘要",
    "摘要正文",
    "标题（你基于内容重新拟定的中文标题，不超过20字）",
  ];
  if (!output || invalid.includes(output)) {
    return "";
  }

  return output;
}

export function normalizeSummaryOutput(params: {
  summary: string;
  fallbackTitle: string;
  fallbackContent: string;
}): string {
  const trimmed = stripCodeFence(params.summary || "");
  if (!trimmed) {
    return "";
  }
  const compact = trimmed.toLowerCase().replace(/\s+/g, " ");
  const explicitFailureSignals = [
    "摘要不可用",
    "正文无效",
    "无法访问",
    "无法读取",
    "captcha",
    "verify you are human",
    "access denied",
    "cloudflare",
  ];
  if (
    trimmed.length <= 180 &&
    explicitFailureSignals.some((token) => compact.includes(token))
  ) {
    return trimmed;
  }

  const lines = trimmed.split(/\r?\n/);
  const firstNonEmpty = lines.find((line) => line.trim());
  const first = firstNonEmpty ? firstNonEmpty.trim() : "";
  const firstIndex = firstNonEmpty ? lines.indexOf(firstNonEmpty) : -1;
  const tailLines =
    firstIndex >= 0 ? lines.slice(firstIndex + 1) : lines.slice(1);

  let titleCandidate = "";
  let bodyPrefix = "";

  const boldTitleMatch = first.match(/^\*\*(.+?)\*\*[\s:：-]*(.*)$/);
  if (boldTitleMatch) {
    titleCandidate = sanitizeTitle(boldTitleMatch[1] || "");
    bodyPrefix = (boldTitleMatch[2] || "").trim();
  } else {
    const plainTitleMatch = first.match(/^标题[\s:：-]*(.*)$/i);
    if (plainTitleMatch) {
      titleCandidate = sanitizeTitle(plainTitleMatch[1] || "");
    } else {
      titleCandidate = sanitizeTitle(first);
    }
  }

  const title =
    titleCandidate || buildFallbackTitle(params.fallbackTitle, params.fallbackContent);

  const mergedBody = [bodyPrefix, ...tailLines].join("\n");
  let body = mergedBody
    .replace(/^摘要正文（[^）]*）\s*$/gm, "")
    .replace(/^摘要正文\s*$/gm, "")
    .replace(/^正文\s*$/gm, "")
    .trim();

  if (!body) {
    body = buildFallbackBody(params.fallbackContent);
  }

  return `**${title}**\n\n${body.trim()}`;
}

export function validateAggregateContent(params: {
  record: NormalizedRecord;
  minLength?: number;
}):
  | { valid: true; normalizedContent: string }
  | { valid: false; reason: string } {
  const minLength = params.minLength ?? 30;
  const normalizedContent = normalizeWhitespace(params.record.content || "");

  if (!normalizedContent) {
    return { valid: false, reason: "正文为空" };
  }

  if (normalizedContent.length < minLength) {
    return {
      valid: false,
      reason: `正文长度不足(${normalizedContent.length})`,
    };
  }

  return { valid: true, normalizedContent };
}

export function validateSummaryOutput(
  summary: string,
): { valid: true } | { valid: false; reason: string } {
  const trimmed = summary.trim();
  if (!trimmed) {
    return { valid: false, reason: "摘要为空" };
  }

  // Lenient mode: only reject clearly unusable outputs.
  const compact = trimmed.toLowerCase().replace(/\s+/g, " ");
  const invalidSignals = [
    "摘要不可用",
    "正文无效",
    "无法访问",
    "无法读取",
    "登录后查看",
    "订阅后查看",
    "captcha",
    "verify you are human",
    "access denied",
    "just a moment",
    "cloudflare",
    "please enable javascript",
  ];
  if (trimmed.length <= 120 && invalidSignals.some((token) => compact.includes(token))) {
    return { valid: false, reason: "摘要明显无效" };
  }

  return { valid: true };
}

export function normalizeTextForSummary(
  input: string,
  maxLength = 5000,
): string {
  const normalized = normalizeWhitespace(input);
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}...`;
}
