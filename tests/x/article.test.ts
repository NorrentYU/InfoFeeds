import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchArticleFromLinks } from "../../src/x/article.js";

describe("x article extraction", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns null when links are only x.com urls", async () => {
    const result = await fetchArticleFromLinks(["https://x.com/a/status/1"]);
    expect(result).toBeNull();
  });

  it("extracts readable article content from external link", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          "<html><head><title>Article</title></head><body><article><p>" +
            "Long form article content ".repeat(20) +
            "</p></article></body></html>",
          {
            status: 200,
            headers: { "content-type": "text/html" },
          },
        ),
      ),
    );

    const result = await fetchArticleFromLinks(["https://example.com/p/1"], {
      minLength: 80,
      timeoutMs: 1000,
    });
    expect(result).not.toBeNull();
    expect(result?.url).toBe("https://example.com/p/1");
    expect(result?.title).toBe("Article");
    expect(result?.content.length).toBeGreaterThanOrEqual(80);
  });

  it("allows x longform article urls", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          "<html><head><title>X Article</title></head><body><article><p>" +
            "X hosted long form content ".repeat(20) +
            "</p></article></body></html>",
          {
            status: 200,
            headers: { "content-type": "text/html" },
          },
        ),
      ),
    );

    const result = await fetchArticleFromLinks(
      ["https://x.com/i/articles/123"],
      {
        minLength: 80,
        timeoutMs: 1000,
      },
    );
    expect(result).not.toBeNull();
    expect(result?.url).toBe("https://x.com/i/articles/123");
    expect(result?.title).toBe("X Article");
    expect(result?.content.length).toBeGreaterThanOrEqual(80);
  });

  it("canonicalizes user article media urls to article root", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        "<html><head><title>X User Article</title></head><body><article><p>" +
          "User article content ".repeat(20) +
          "</p></article></body></html>",
        {
          status: 200,
          headers: { "content-type": "text/html" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchArticleFromLinks(
      [
        "https://x.com/rf_extended/article/2029898185561239566/media/2029696706061746176",
      ],
      {
        minLength: 80,
        timeoutMs: 1000,
      },
    );

    expect(result).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://x.com/rf_extended/article/2029898185561239566",
    );
    expect(result?.url).toBe(
      "https://x.com/rf_extended/article/2029898185561239566",
    );
  });

  it("rejects x blocked page text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          "<html><body><main>Something went wrong, but don’t fret — let’s give it another shot. Some privacy related extensions may cause issues on x.com.</main></body></html>",
          {
            status: 200,
            headers: { "content-type": "text/html" },
          },
        ),
      ),
    );

    const result = await fetchArticleFromLinks(
      ["https://x.com/rf_extended/article/2029898185561239566"],
      {
        minLength: 80,
        timeoutMs: 1000,
      },
    );
    expect(result).toBeNull();
  });
});
