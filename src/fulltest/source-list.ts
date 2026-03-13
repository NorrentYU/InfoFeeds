import { readFile } from "node:fs/promises";

export interface SourceListGroups {
  telegram: string[];
  substack: string[];
  youtube: string[];
  others: string[];
}

const EMPTY_GROUPS: SourceListGroups = {
  telegram: [],
  substack: [],
  youtube: [],
  others: [],
};

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

export async function loadSourceList(path: string): Promise<SourceListGroups> {
  try {
    const markdown = await readFile(path, "utf8");
    return parseSourceListMarkdown(markdown);
  } catch {
    return { ...EMPTY_GROUPS };
  }
}
