function stripTrailingSlash(pathname: string): string {
  if (pathname === "/") {
    return pathname;
  }
  return pathname.replace(/\/+$/, "") || "/";
}

const CHANNEL_TABS = ["videos", "streams"] as const;
const KNOWN_CHANNEL_SUFFIXES = [...CHANNEL_TABS, "live"] as const;

function removeKnownTab(pathname: string): string {
  const normalized = stripTrailingSlash(pathname);
  for (const tab of KNOWN_CHANNEL_SUFFIXES) {
    const suffix = `/${tab}`;
    if (normalized.endsWith(suffix)) {
      const base = normalized.slice(0, -suffix.length);
      return stripTrailingSlash(base || "/");
    }
  }
  return normalized;
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

export function buildChannelTabUrls(
  source: string,
  options: { includeStreams?: boolean } = {},
): string[] | null {
  const normalized = normalizeSourceUrl(source);
  if (!normalized) {
    return null;
  }

  const parsed = new URL(normalized);
  const basePath = removeKnownTab(parsed.pathname);
  const tabs = options.includeStreams === false ? ["videos"] : CHANNEL_TABS;
  const urls: string[] = [];
  for (const tab of tabs) {
    parsed.pathname = basePath === "/" ? `/${tab}` : `${basePath}/${tab}`;
    urls.push(parsed.toString());
  }
  return urls;
}

export function buildChannelVideosUrl(source: string): string | null {
  const channelUrls = buildChannelTabUrls(source, { includeStreams: false });
  if (!channelUrls || channelUrls.length === 0) {
    return null;
  }
  return channelUrls[0];
}

export function sourceNameFromUrl(source: string): string {
  const normalized = normalizeSourceUrl(source);
  if (!normalized) {
    return source;
  }

  const parsed = new URL(normalized);
  const pathname = removeKnownTab(stripTrailingSlash(parsed.pathname));
  if (pathname !== "/") {
    const segment = pathname.split("/").filter(Boolean).pop() || "";
    return segment.startsWith("@") ? segment.slice(1) : segment;
  }

  return parsed.hostname.replace(/^www\./, "");
}

export function buildVideoUrl(videoIdOrUrl: string): string | null {
  try {
    const parsed = new URL(videoIdOrUrl);
    if (
      parsed.hostname.includes("youtube.com") ||
      parsed.hostname === "youtu.be"
    ) {
      if (parsed.hostname === "youtu.be") {
        return `https://www.youtube.com/watch?v=${parsed.pathname.replace(/^\/+/, "")}`;
      }
      if (parsed.pathname === "/watch" && parsed.searchParams.get("v")) {
        return `https://www.youtube.com/watch?v=${parsed.searchParams.get("v")}`;
      }
      return parsed.toString();
    }
  } catch {
    if (/^[A-Za-z0-9_-]{6,}$/.test(videoIdOrUrl)) {
      return `https://www.youtube.com/watch?v=${videoIdOrUrl}`;
    }
  }

  return null;
}
