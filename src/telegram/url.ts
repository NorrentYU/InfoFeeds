const TRACKING_PARAM_PREFIXES = ["utm_"];
const TRACKING_PARAMS = new Set([
  "fbclid",
  "gclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "mkt_tok",
  "ref",
  "ref_src",
  "spm"
]);

const TELEGRAM_HOST_SUFFIXES = ["t.me", "telegram.me", "telegram.org"];

function stripTrailingSlash(pathname: string): string {
  if (pathname === "/") {
    return pathname;
  }
  return pathname.replace(/\/+$/, "") || "/";
}

export function normalizeUrl(rawUrl: string, baseUrl?: string): string | null {
  try {
    const parsed = baseUrl ? new URL(rawUrl, baseUrl) : new URL(rawUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    parsed.hash = "";
    parsed.pathname = stripTrailingSlash(parsed.pathname);

    const keys = Array.from(parsed.searchParams.keys());
    for (const key of keys) {
      const lowered = key.toLowerCase();
      const isTrackingPrefix = TRACKING_PARAM_PREFIXES.some((prefix) =>
        lowered.startsWith(prefix)
      );
      if (isTrackingPrefix || TRACKING_PARAMS.has(lowered)) {
        parsed.searchParams.delete(key);
      }
    }

    if (
      (parsed.protocol === "https:" && parsed.port === "443") ||
      (parsed.protocol === "http:" && parsed.port === "80")
    ) {
      parsed.port = "";
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

export function isTelegramUrl(input: string): boolean {
  try {
    const hostname = new URL(input).hostname.toLowerCase();
    return TELEGRAM_HOST_SUFFIXES.some(
      (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`)
    );
  } catch {
    return false;
  }
}

export function extractTelegramHandle(source: string): string {
  const trimmed = source.trim();

  if (trimmed.startsWith("@")) {
    return trimmed.slice(1);
  }

  try {
    const parsed = new URL(trimmed);
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments[0] === "s" && segments[1]) {
      return segments[1];
    }
    if (segments[0]) {
      return segments[0];
    }
  } catch {
    // fall through and sanitize free-text value
  }

  return trimmed.replace(/^@/, "").replace(/^https?:\/\//, "");
}

export function telegramSourceName(source: string): string {
  return extractTelegramHandle(source);
}

export function telegramFeedUrl(source: string): string {
  const handle = extractTelegramHandle(source);
  return `https://t.me/s/${handle}`;
}
