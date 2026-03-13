import { describe, expect, it } from "vitest";
import { htmlToText, validateOthersContent } from "../../src/others/filters.js";

describe("others content filters", () => {
  it("converts html to readable text", () => {
    const text = htmlToText(
      "<article><h1>Hello</h1><p>World World World</p></article>",
    );
    expect(text).toContain("Hello");
    expect(text).toContain("World World World");
  });

  it("does not reject blocker-like phrases by keyword", () => {
    const validation = validateOthersContent({
      text: "Just a moment... Verify you are human and complete captcha.",
      minLength: 10,
    });
    expect(validation.valid).toBe(true);
  });

  it("rejects likely paywall prompts", () => {
    const validation = validateOthersContent({
      text: "This post is for paid subscribers. Upgrade to paid. Already a subscriber? Sign in.",
      minLength: 10,
    });
    expect(validation.valid).toBe(false);
  });

  it("accepts normal long content", () => {
    const validation = validateOthersContent({
      text: "This is a valid long-form newsletter article body with analysis and details. ".repeat(
        10,
      ),
    });
    expect(validation.valid).toBe(true);
  });
});
