import { describe, expect, it } from "vitest";
import {
  extractReadableContent,
  validateExtractedContent,
  validateTelegramTextContent,
  validateSubstackRssContent,
} from "../../src/telegram/filters.js";

describe("content filters", () => {
  it("extracts title and body content", () => {
    const html = `
      <html><head><title>Post title</title></head>
      <body><article><p>Hello world text repeated. Hello world text repeated. Hello world text repeated. Hello world text repeated.</p></article></body>
      </html>
    `;
    const extracted = extractReadableContent(html);
    expect(extracted.title).toBe("Post title");
    expect(extracted.content).toContain("Hello world text repeated");
  });

  it("does not block captcha keywords by default", () => {
    const html = `<html><head><title>Just a moment...</title></head><body>Verify you are human captcha</body></html>`;
    const extracted = extractReadableContent(html);
    const validation = validateExtractedContent({
      rawHtml: html,
      title: extracted.title,
      content: extracted.content,
      minLength: 10,
    });

    expect(validation.valid).toBe(true);
  });

  it("does not block x.com shell phrases by keyword", () => {
    const html = `<html><body>Something went wrong, but don't fret — let's give it another shot. Try again. Some privacy related extensions may cause issues on x.com.</body></html>`;
    const extracted = extractReadableContent(html);
    const validation = validateExtractedContent({
      rawHtml: html,
      title: extracted.title,
      content: extracted.content,
      minLength: 10,
    });

    expect(validation.valid).toBe(true);
  });

  it("validates text-only telegram messages", () => {
    const valid = validateTelegramTextContent({
      text: "这是一条较长的频道文字消息，用于测试无外链情况下的正文降级抓取逻辑。".repeat(
        3,
      ),
    });
    expect(valid.valid).toBe(true);

    const invalid = validateTelegramTextContent({
      text: "短消息",
    });
    expect(invalid.valid).toBe(false);
  });

  it("allows normal rss text containing weak phrase", () => {
    const validation = validateSubstackRssContent({
      text:
        "The most dangerous moment in a community's life is after its first success: " +
        "the system can decay into nostalgia or just a moment of self-congratulation. " +
        "Distributed leadership is a biological necessity, not a democratic ideal.".repeat(
          3,
        ),
      minLength: 100,
    });
    expect(validation.valid).toBe(true);
  });

  it("does not block weak challenge-like phrase in rss", () => {
    const validation = validateSubstackRssContent({
      text: "Just a moment... please complete captcha challenge and verify you are human before continuing.",
      minLength: 10,
    });
    expect(validation.valid).toBe(true);
  });

  it("does not block weak phrase with generic challenge wording in rss", () => {
    const validation = validateSubstackRssContent({
      text:
        "Communities often fail when they optimize for optics over truth. " +
        "Success is the test of whether you built a culture or just a moment. " +
        "The next challenge is distributed leadership and shared stewardship.".repeat(
          2,
        ),
      minLength: 100,
    });
    expect(validation.valid).toBe(true);
  });
});
