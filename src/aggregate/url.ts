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

export function canonicalizeUrl(input: string): string | null {
  try {
    const parsed = new URL(input);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    parsed.hash = "";
    parsed.pathname = stripTrailingSlash(parsed.pathname);
    parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");

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
