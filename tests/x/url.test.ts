import { describe, expect, it } from "vitest";
import { isStatusUrl, normalizeStatusUrl } from "../../src/x/url.js";

describe("x url helpers", () => {
  it("normalizes x and twitter status urls", () => {
    expect(normalizeStatusUrl("https://x.com/openai/status/12345?t=abc")).toBe(
      "https://x.com/openai/status/12345",
    );
    expect(normalizeStatusUrl("https://twitter.com/openai/status/12345")).toBe(
      "https://x.com/openai/status/12345",
    );
  });

  it("normalizes relative status urls", () => {
    expect(normalizeStatusUrl("/openai/status/987654321")).toBe(
      "https://x.com/openai/status/987654321",
    );
    expect(normalizeStatusUrl("/openai/status/987654321/photo/1")).toBe(
      "https://x.com/openai/status/987654321",
    );
  });

  it("rejects non-status links", () => {
    expect(isStatusUrl("https://x.com/home")).toBe(false);
    expect(normalizeStatusUrl("https://example.com/x/status/1")).toBeNull();
  });
});
