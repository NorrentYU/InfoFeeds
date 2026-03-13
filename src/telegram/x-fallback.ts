import { fetchTextWithRetry } from "./http.js";

export function isXUrl(input: string): boolean {
  try {
    const hostname = new URL(input).hostname.toLowerCase();
    return hostname === "x.com" || hostname === "www.x.com" || hostname === "twitter.com" || hostname === "www.twitter.com";
  } catch {
    return false;
  }
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function toJinaProxyUrl(targetUrl: string): string {
  const withoutProtocol = targetUrl.replace(/^https?:\/\//i, "");
  return `https://r.jina.ai/http://${withoutProtocol}`;
}

function stripShellNoise(input: string): string {
  let output = input;

  output = output.replace(/Don[’']t miss what[\s\S]*?Post\s*-+\s*Conversation\s*-+/gi, "");
  output = output.replace(/New to X\?[\s\S]*$/gi, "");
  output = output.replace(/Something went wrong\.\s*Try reloading\.?/gi, "");
  output = output.replace(/Sign up now to get your own personalized timeline!?/gi, "");

  return normalizeWhitespace(output);
}

export function parseJinaMarkdown(rawText: string): { title: string; content: string } | null {
  const titleMatch = rawText.match(/^Title:\s*(.+)$/m);
  const title = normalizeWhitespace(titleMatch?.[1] || "");

  const marker = "Markdown Content:";
  const markerIndex = rawText.indexOf(marker);
  const contentRaw = markerIndex >= 0 ? rawText.slice(markerIndex + marker.length) : rawText;
  const content = stripShellNoise(contentRaw);

  if (!content || content.length < 140) {
    return null;
  }

  return { title, content };
}

export async function fetchXFallbackContent(params: {
  originalUrl: string;
  timeoutMs: number;
  retryCount: number;
  retryDelayMs: number;
}): Promise<{ title: string; content: string; attempt: number } | null> {
  if (!isXUrl(params.originalUrl)) {
    return null;
  }

  const proxyUrl = toJinaProxyUrl(params.originalUrl);
  const response = await fetchTextWithRetry(proxyUrl, {
    timeoutMs: params.timeoutMs,
    retryCount: params.retryCount,
    retryDelayMs: params.retryDelayMs
  });

  const parsed = parseJinaMarkdown(response.body);
  if (!parsed) {
    return null;
  }

  return {
    title: parsed.title,
    content: parsed.content,
    attempt: response.attempt
  };
}
