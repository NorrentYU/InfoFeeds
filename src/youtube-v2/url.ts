import type { YoutubeFeedKind } from "./types.js";
import { normalizeSourceUrl } from "../youtube/url.js";

function stripTrailingSlash(pathname: string): string {
  if (pathname === "/") {
    return pathname;
  }
  return pathname.replace(/\/+$/, "") || "/";
}

function removeKnownTab(pathname: string): string {
  const normalized = stripTrailingSlash(pathname);
  for (const suffix of ["videos", "streams", "live"]) {
    const token = `/${suffix}`;
    if (normalized.endsWith(token)) {
      const base = normalized.slice(0, -token.length);
      return stripTrailingSlash(base || "/");
    }
  }
  return normalized;
}

export function buildFeedChannelUrl(
  sourceUrl: string,
  feedKind: YoutubeFeedKind,
): string | null {
  const normalized = normalizeSourceUrl(sourceUrl);
  if (!normalized) {
    return null;
  }

  const parsed = new URL(normalized);
  const basePath = removeKnownTab(parsed.pathname);
  parsed.pathname = basePath === "/" ? `/${feedKind}` : `${basePath}/${feedKind}`;
  return parsed.toString();
}
