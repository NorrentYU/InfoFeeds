import { describe, expect, it } from "vitest";
import { isXUrl, parseJinaMarkdown } from "../../src/telegram/x-fallback.js";

describe("x fallback helpers", () => {
  it("detects x/twitter urls", () => {
    expect(isXUrl("https://x.com/user/status/1")).toBe(true);
    expect(isXUrl("https://twitter.com/user/status/1")).toBe(true);
    expect(isXUrl("https://example.com/post")).toBe(false);
  });

  it("parses markdown content from jina proxy", () => {
    const raw = `Title: Demo tweet\n\nURL Source: http://x.com/demo/status/1\n\nMarkdown Content:\nHello world this is a long enough content block. Hello world this is a long enough content block. Hello world this is a long enough content block.`;
    const parsed = parseJinaMarkdown(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.title).toBe("Demo tweet");
    expect(parsed?.content.length).toBeGreaterThan(140);
  });

  it("removes x shell noise", () => {
    const raw = `Title: Demo tweet\n\nMarkdown Content:\nDon't miss what's happening People on X are the first to know. Post ---- Conversation ------------ Real tweet body starts here and continues with enough detail to exceed content length. Real tweet body starts here and continues with enough detail to exceed content length. New to X? Sign up now to get your own personalized timeline! Something went wrong. Try reloading.`;
    const parsed = parseJinaMarkdown(raw);

    expect(parsed).not.toBeNull();
    expect(parsed?.content.includes("New to X?")).toBe(false);
    expect(parsed?.content.includes("Something went wrong")).toBe(false);
  });
});
