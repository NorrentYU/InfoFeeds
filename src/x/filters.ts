function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function validateTweetContent(params: {
  text: string;
}): { valid: true } | { valid: false; reason: string } {
  const normalized = normalizeWhitespace(params.text);
  if (!normalized) {
    return { valid: false, reason: "推文正文为空" };
  }

  return { valid: true };
}

export function normalizeTweetText(text: string): string {
  return normalizeWhitespace(text);
}
