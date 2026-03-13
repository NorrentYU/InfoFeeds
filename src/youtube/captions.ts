import { load } from "cheerio";
import { fetchTextWithRetry } from "../telegram/http.js";
import type { CaptionFetchResult, CaptionTrack } from "./types.js";

const FORMAT_PRIORITY = ["json3", "vtt", "srv3", "srv2", "srv1", "ttml"];
const ENGLISH_CODES = ["en", "en-us", "en-gb", "en-ca", "en-au"];

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function decodeHtml(value: string): string {
  return load(`<div>${value}</div>`)("div")
    .text()
    .replace(/&nbsp;/gi, " ");
}

function formatScore(ext: string): number {
  const index = FORMAT_PRIORITY.indexOf(ext.toLowerCase());
  return index === -1 ? FORMAT_PRIORITY.length : index;
}

function languageScore(language: string): number {
  const lowered = language.toLowerCase();
  const index = ENGLISH_CODES.indexOf(lowered);
  return index === -1 ? ENGLISH_CODES.length : index;
}

export function selectCaptionTrack(
  tracks: CaptionTrack[],
): CaptionTrack | null {
  if (tracks.length === 0) {
    return null;
  }

  return [...tracks].sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === "manual" ? -1 : 1;
    }

    const languageDiff =
      languageScore(left.language) - languageScore(right.language);
    if (languageDiff !== 0) {
      return languageDiff;
    }

    return formatScore(left.ext) - formatScore(right.ext);
  })[0];
}

export function parseJson3Captions(raw: string): string {
  const parsed = JSON.parse(raw) as {
    events?: Array<{ segs?: Array<{ utf8?: string }> }>;
  };

  const parts: string[] = [];
  for (const event of parsed.events || []) {
    const joined = (event.segs || [])
      .map((segment) => decodeHtml(segment.utf8 || ""))
      .join("");
    const normalized = normalizeWhitespace(joined);
    if (normalized) {
      parts.push(normalized);
    }
  }

  return normalizeWhitespace(parts.join(" "));
}

export function parseVttCaptions(raw: string): string {
  const lines = raw.split(/\r?\n/);
  const parts: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    if (
      trimmed === "WEBVTT" ||
      trimmed.startsWith("NOTE") ||
      trimmed.includes("-->") ||
      /^\d+$/.test(trimmed)
    ) {
      continue;
    }
    const withoutTags = trimmed.replace(/<[^>]+>/g, " ");
    const normalized = normalizeWhitespace(decodeHtml(withoutTags));
    if (normalized) {
      parts.push(normalized);
    }
  }

  return normalizeWhitespace(parts.join(" "));
}

export function parseCaptionText(raw: string, ext: string): string {
  switch (ext.toLowerCase()) {
    case "json3":
      return parseJson3Captions(raw);
    case "vtt":
    case "srv3":
    case "srv2":
    case "srv1":
      return parseVttCaptions(raw);
    case "ttml":
      return normalizeWhitespace(load(raw, { xmlMode: true }).text());
    default:
      return normalizeWhitespace(raw);
  }
}

export async function fetchCaptionText(
  track: CaptionTrack,
  options: {
    timeoutMs?: number;
    retryCount?: number;
    retryDelayMs?: number;
  } = {},
): Promise<CaptionFetchResult> {
  const response = await fetchTextWithRetry(track.url, {
    timeoutMs: options.timeoutMs ?? 20000,
    retryCount: options.retryCount ?? 1,
    retryDelayMs: options.retryDelayMs ?? 800,
  });

  return {
    text: parseCaptionText(response.body, track.ext),
    track,
  };
}
