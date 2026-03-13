import { describe, expect, it } from "vitest";
import {
  htmlToText,
  validateSubstackContent,
} from "../../src/substack/filters.js";

describe("substack content filters", () => {
  it("converts html to readable text", () => {
    const text = htmlToText(
      "<article><h1>Hello</h1><p>World World World</p></article>",
    );
    expect(text).toContain("Hello");
    expect(text).toContain("World World World");
  });

  it("does not reject blocker-like phrases by keyword", () => {
    const validation = validateSubstackContent({
      text: "Just a moment... Verify you are human and complete captcha.",
      minLength: 10,
    });
    expect(validation.valid).toBe(true);
  });

  it("rejects likely paywall prompts", () => {
    const validation = validateSubstackContent({
      text: "This post is for paid subscribers. Upgrade to paid. Already a subscriber? Sign in.",
      minLength: 10,
    });
    expect(validation.valid).toBe(false);
  });

  it("accepts normal long content", () => {
    const validation = validateSubstackContent({
      text: "This is a valid long-form substack article body with analysis and details. ".repeat(
        10,
      ),
    });
    expect(validation.valid).toBe(true);
  });
});
