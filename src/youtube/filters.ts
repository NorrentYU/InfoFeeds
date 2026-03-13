const BLOCK_PATTERNS = [
  "sign in to confirm you are not a bot",
  "video unavailable",
  "this video is unavailable",
  "please try again later",
  "an error occurred",
  "playback on other websites has been disabled",
];

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function countMatches(text: string, patterns: string[]): number {
  const lowered = text.toLowerCase();
  return patterns.filter((pattern) => lowered.includes(pattern)).length;
}

export function validateYoutubeTranscript(params: {
  text: string;
  minLength?: number;
}): { valid: true } | { valid: false; reason: string } {
  const normalized = normalizeWhitespace(params.text);
  const minLength = params.minLength ?? 80;

  if (!normalized) {
    return { valid: false, reason: "字幕文本为空" };
  }

  if (countMatches(normalized, BLOCK_PATTERNS) > 0) {
    return { valid: false, reason: "命中错误页/占位文案" };
  }

  if (normalized.length < minLength) {
    return { valid: false, reason: `字幕长度不足(${normalized.length})` };
  }

  return { valid: true };
}
