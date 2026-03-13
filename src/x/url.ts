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

export function normalizeStatusUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = trimmed.startsWith("/")
      ? new URL(trimmed, "https://x.com")
      : new URL(normalizeProtocol(trimmed), "https://x.com");
    const hostname = parsed.hostname.toLowerCase();
    const isXHost =
      hostname === "x.com" ||
      hostname === "www.x.com" ||
      hostname === "twitter.com" ||
      hostname === "www.twitter.com" ||
      hostname === "mobile.twitter.com";
    if (!isXHost) {
      return null;
    }

    const pathname = stripTrailingSlash(parsed.pathname);
    const match = pathname.match(/^\/([^/]+)\/status\/(\d+)(?:\/.*)?$/i);
    if (!match) {
      return null;
    }

    return `https://x.com/${match[1]}/status/${match[2]}`;
  } catch {
    return null;
  }
}

export function isStatusUrl(raw: string): boolean {
  return normalizeStatusUrl(raw) !== null;
}
