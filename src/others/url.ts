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
  "spm",
]);

function stripTrailingSlash(pathname: string): string {
  if (pathname === "/") {
    return pathname;
  }
  return pathname.replace(/\/+$/, "") || "/";
}

function normalizeProtocol(raw: string): string {
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

export function normalizeSourceUrl(source: string): string | null {
  try {
    const parsed = new URL(normalizeProtocol(source));
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    parsed.hash = "";
    parsed.search = "";
    parsed.pathname = stripTrailingSlash(parsed.pathname);
    return parsed.toString();
  } catch {
    return null;
  }
}

export function sourceNameFromUrl(source: string): string {
  const normalized = normalizeSourceUrl(source);
  if (!normalized) {
    return source;
  }
  const parsed = new URL(normalized);
  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const path = stripTrailingSlash(parsed.pathname);
  if (path === "/") {
    return hostname;
  }
  return `${hostname}${path}`;
}

export function buildFeedUrl(source: string): string | null {
  const normalized = normalizeSourceUrl(source);
  if (!normalized) {
    return null;
  }

  const parsed = new URL(normalized);
  const pathname = stripTrailingSlash(parsed.pathname);
  if (pathname.toLowerCase().endsWith("/feed")) {
    return parsed.toString();
  }

  parsed.pathname = pathname === "/" ? "/feed" : `${pathname}/feed`;
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}

export function normalizeArticleUrl(
  rawUrl: string,
  baseUrl?: string,
): string | null {
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
        lowered.startsWith(prefix),
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

export function isFeedUrl(candidate: string): boolean {
  try {
    const pathname = stripTrailingSlash(
      new URL(candidate).pathname,
    ).toLowerCase();
    return pathname.endsWith("/feed");
  } catch {
    return false;
  }
}
