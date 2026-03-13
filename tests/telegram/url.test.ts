import { describe, expect, it } from "vitest";
import {
  extractTelegramHandle,
  isTelegramUrl,
  normalizeUrl,
  telegramFeedUrl,
  telegramSourceName
} from "../../src/telegram/url.js";

describe("telegram url helpers", () => {
  it("normalizes tracking parameters", () => {
    const value = normalizeUrl("https://example.com/post?utm_source=tg&id=1#part");
    expect(value).toBe("https://example.com/post?id=1");
  });

  it("rejects non-http protocol", () => {
    const value = normalizeUrl("mailto:test@example.com");
    expect(value).toBeNull();
  });

  it("detects telegram hosts", () => {
    expect(isTelegramUrl("https://t.me/cookiesreads/1")).toBe(true);
    expect(isTelegramUrl("https://example.com/article")).toBe(false);
  });

  it("extracts handle from source", () => {
    expect(extractTelegramHandle("https://t.me/cookiesreads")).toBe("cookiesreads");
    expect(extractTelegramHandle("@web3list")).toBe("web3list");
  });

  it("builds feed url and source name", () => {
    expect(telegramFeedUrl("https://t.me/web3list")).toBe("https://t.me/s/web3list");
    expect(telegramSourceName("@web3list")).toBe("web3list");
  });
});
