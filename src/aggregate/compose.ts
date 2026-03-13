import type { DigestItem, SourceType } from "./types.js";

const CHANNEL_ORDER: SourceType[] = [
  "telegram",
  "x",
  "substack",
  "youtube",
  "others",
];

const CHANNEL_LABEL: Record<SourceType, string> = {
  telegram: "Telegram",
  x: "X",
  substack: "Substack",
  youtube: "Youtube",
  others: "其他",
};

const WEEKDAY_CN = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

function toShanghaiDateParts(now: Date): {
  year: number;
  month: number;
  day: number;
  weekday: string;
  hh: string;
  mm: string;
} {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const map = new Map<string, string>();
  for (const part of parts) {
    if (part.type !== "literal") {
      map.set(part.type, part.value);
    }
  }

  const weekday = map.get("weekday") || WEEKDAY_CN[now.getUTCDay()];
  return {
    year: Number(map.get("year") || now.getUTCFullYear()),
    month: Number(map.get("month") || now.getUTCMonth() + 1),
    day: Number(map.get("day") || now.getUTCDate()),
    weekday,
    hh: (map.get("hour") || "00").padStart(2, "0"),
    mm: (map.get("minute") || "00").padStart(2, "0"),
  };
}

export function renderDigestMarkdown(params: {
  items: DigestItem[];
  now: Date;
}): string {
  const grouped = new Map<SourceType, DigestItem[]>();
  for (const sourceType of CHANNEL_ORDER) {
    grouped.set(sourceType, []);
  }

  for (const item of params.items) {
    grouped.get(item.source_type)?.push(item);
  }

  const lines: string[] = [];
  const date = toShanghaiDateParts(params.now);
  lines.push(
    "# 信息集会",
    "",
    `${date.year}年${date.month}月${date.day}日${date.weekday}，${date.hh}:${date.mm}`,
    "",
  );

  for (const sourceType of CHANNEL_ORDER) {
    lines.push(`## ${CHANNEL_LABEL[sourceType]}`, "");
    const items = grouped.get(sourceType) || [];

    if (items.length === 0) {
      lines.push("（无有效内容）", "");
      continue;
    }

    for (const item of items) {
      if (sourceType !== "x") {
        lines.push(`[${item.source_name}]`);
      }
      const linkText = item.url.trim() ? item.url : "N/A（无外链）";
      lines.push(item.summary, `原链接：${linkText}`, "");
    }
  }

  return `${lines.join("\n").trim()}\n`;
}
