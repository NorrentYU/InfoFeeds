import { load } from "cheerio";
import { fetchTextWithRetry } from "./http.js";
import { normalizeUrl, isTelegramUrl, telegramFeedUrl, telegramSourceName } from "./url.js";
import type { TelegramMessage } from "./types.js";

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function titleFromMessage(text: string): string {
  const normalized = normalizeWhitespace(text);
  if (!normalized) {
    return "(无标题)";
  }
  return normalized.slice(0, 120);
}

export function parseChannelMessagesFromHtml(params: {
  sourceUrl: string;
  sourceName: string;
  html: string;
  now: Date;
  windowHours: number;
  maxMessagesPerSource: number;
}): TelegramMessage[] {
  const $ = load(params.html);
  const sinceMs = params.now.getTime() - params.windowHours * 60 * 60 * 1000;

  const messages: TelegramMessage[] = [];
  const wraps = $(".tgme_widget_message_wrap").toArray();

  for (const wrap of wraps) {
    const node = $(wrap);
    const timeRaw = node.find("time").first().attr("datetime");
    if (!timeRaw) {
      continue;
    }

    const publishedAt = new Date(timeRaw);
    if (Number.isNaN(publishedAt.getTime()) || publishedAt.getTime() < sinceMs) {
      continue;
    }

    const messageUrl =
      node.find("a.tgme_widget_message_date").first().attr("href") ||
      node.find(".tgme_widget_message_date a").first().attr("href") ||
      "";

    const textNode = node.find(".tgme_widget_message_text").first();
    const messageText = normalizeWhitespace(textNode.text());

    const rawLinks = new Set<string>();
    textNode.find("a[href]").each((_, link) => {
      const href = $(link).attr("href");
      if (href) {
        rawLinks.add(href);
      }
    });

    node.find(".tgme_widget_message_link_preview a[href]").each((_, link) => {
      const href = $(link).attr("href");
      if (href) {
        rawLinks.add(href);
      }
    });

    const externalLinks = Array.from(rawLinks)
      .map((href) => normalizeUrl(href, params.sourceUrl))
      .filter((href): href is string => Boolean(href && !isTelegramUrl(href)));

    messages.push({
      sourceName: params.sourceName,
      sourceUrl: params.sourceUrl,
      messageUrl,
      messageText,
      messageTitle: titleFromMessage(messageText),
      externalLinks,
      publishedAt: publishedAt.toISOString()
    });

    if (messages.length >= params.maxMessagesPerSource) {
      break;
    }
  }

  return messages;
}

export async function fetchChannelMessages(params: {
  sourceUrl: string;
  now: Date;
  windowHours: number;
  timeoutMs: number;
  retryCount: number;
  retryDelayMs: number;
  maxMessagesPerSource: number;
}): Promise<TelegramMessage[]> {
  const sourceName = telegramSourceName(params.sourceUrl);
  const feedUrl = telegramFeedUrl(params.sourceUrl);

  const feed = await fetchTextWithRetry(feedUrl, {
    timeoutMs: params.timeoutMs,
    retryCount: params.retryCount,
    retryDelayMs: params.retryDelayMs
  });

  return parseChannelMessagesFromHtml({
    sourceUrl: params.sourceUrl,
    sourceName,
    html: feed.body,
    now: params.now,
    windowHours: params.windowHours,
    maxMessagesPerSource: params.maxMessagesPerSource
  });
}
