import { readFile } from "node:fs/promises";

export interface SourceListGroups {
  telegram: string[];
  substack: string[];
  youtube: string[];
  others: string[];
}

export type SourceListSection = "telegram" | "substack" | "youtube" | "others" | "x";

export interface SourceListTemplateGuideItem {
  section: SourceListSection;
  description: string;
  example: string;
  note: string;
}

const EMPTY_GROUPS: SourceListGroups = {
  telegram: [],
  substack: [],
  youtube: [],
  others: [],
};

export const SOURCE_LIST_TEMPLATE = `# Telegram
1. https://t.me/AGGRNEWSWIRE

# Substack
1. https://bestofsub.substack.com/

# YouTube
1. https://www.youtube.com/@MrBeast

# Others
Only websites with RSS feed are supported in this section.
Add websites whose root URL or /feed endpoint exposes a readable RSS feed.

# X
X does not read from sourceList.md.
It always fetches the logged-in For You timeline from the dedicated X browser session.
`;

export const SOURCE_LIST_TEMPLATE_GUIDANCE: SourceListTemplateGuideItem[] = [
  {
    section: "telegram",
    description: "Replace the demo Telegram channel with the public channels you want to monitor.",
    example: "https://t.me/AGGRNEWSWIRE",
    note: "Use full Telegram channel URLs. Add one source per numbered line.",
  },
  {
    section: "substack",
    description: "Replace the demo Substack with the publications you actually read.",
    example: "https://bestofsub.substack.com/",
    note: "Use the publication home URL. The fetcher will read its RSS feed.",
  },
  {
    section: "youtube",
    description: "Replace the demo YouTube channel with the channels whose latest videos you want summarized.",
    example: "https://www.youtube.com/@MrBeast",
    note: "Use the channel handle URL, not an individual video URL.",
  },
  {
    section: "others",
    description: "Add only websites that expose a readable RSS feed from the root URL or /feed endpoint.",
    example: "https://every.to/chain-of-thought/",
    note: "If a site has no RSS feed, leave it out of this section.",
  },
  {
    section: "x",
    description: "Do not add X sources here.",
    example: "X uses the dedicated logged-in For You browser session.",
    note: "Configure X through `npm run cli -- setup open-browser x`, not through sourceList.md.",
  },
];

function normalizeMarkdown(markdown: string): string {
  return markdown.replace(/\r\n/g, "\n").trim();
}

function dedupePreserveOrder(items: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const item of items) {
    if (seen.has(item)) {
      continue;
    }
    seen.add(item);
    output.push(item);
  }

  return output;
}

export function parseSourceListMarkdown(markdown: string): SourceListGroups {
  const groups: SourceListGroups = {
    telegram: [],
    substack: [],
    youtube: [],
    others: [],
  };

  const lines = markdown.split(/\r?\n/);
  let section: keyof SourceListGroups | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const heading = line.match(/^#\s+(.+)$/);
    if (heading) {
      const name = heading[1]?.trim().toLowerCase();
      if (name === "telegram") {
        section = "telegram";
      } else if (name === "substack") {
        section = "substack";
      } else if (name === "youtube") {
        section = "youtube";
      } else if (name === "others") {
        section = "others";
      } else {
        section = null;
      }
      continue;
    }

    if (!section) {
      continue;
    }

    const numbered = line.match(/^\d+\.\s*(.+)$/);
    const bullet = line.match(/^-\s*(.+)$/);
    const value = (numbered?.[1] || bullet?.[1] || "").trim();
    if (!value) {
      continue;
    }

    groups[section].push(value);
  }

  return {
    telegram: dedupePreserveOrder(groups.telegram),
    substack: dedupePreserveOrder(groups.substack),
    youtube: dedupePreserveOrder(groups.youtube),
    others: dedupePreserveOrder(groups.others),
  };
}

export function isSourceListTemplateUnchanged(markdown: string): boolean {
  return normalizeMarkdown(markdown) === normalizeMarkdown(SOURCE_LIST_TEMPLATE);
}

export async function loadSourceList(path: string): Promise<SourceListGroups> {
  try {
    const markdown = await readFile(path, "utf8");
    return parseSourceListMarkdown(markdown);
  } catch {
    return { ...EMPTY_GROUPS };
  }
}
