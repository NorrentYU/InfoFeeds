import { describe, expect, it } from "vitest";
import { parseSourceListMarkdown } from "../../src/fulltest/source-list.js";

describe("sourceList parser", () => {
  it("parses and dedupes grouped sources", () => {
    const markdown = `
# Telegram
1. https://t.me/a
2. https://t.me/b
2. https://t.me/b

# Substack
1. https://s1.com/

# Youtube
1. https://youtube.com/@a

# Others
1. https://every.to/a
`;

    const parsed = parseSourceListMarkdown(markdown);
    expect(parsed.telegram).toEqual(["https://t.me/a", "https://t.me/b"]);
    expect(parsed.substack).toEqual(["https://s1.com/"]);
    expect(parsed.youtube).toEqual(["https://youtube.com/@a"]);
    expect(parsed.others).toEqual(["https://every.to/a"]);
  });
});
