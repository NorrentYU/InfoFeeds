import { describe, expect, it } from "vitest";
import {
  normalizeTweetText,
  validateTweetContent,
} from "../../src/x/filters.js";

describe("x content filters", () => {
  it("normalizes tweet whitespace", () => {
    expect(normalizeTweetText("hello   \n world")).toBe("hello world");
  });

  it("rejects empty text", () => {
    const result = validateTweetContent({ text: "   " });
    expect(result.valid).toBe(false);
  });

  it("accepts challenge-like wording in normal tweet text", () => {
    const result = validateTweetContent({
      text: "Please complete CAPTCHA to continue.",
    });
    expect(result.valid).toBe(true);
  });

  it("accepts normal tweet text", () => {
    const result = validateTweetContent({
      text: "Ship fast and keep learning.",
    });
    expect(result.valid).toBe(true);
  });
});
