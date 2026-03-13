import { describe, expect, it, vi } from "vitest";
import {
  createYoutubeNotebooklmSummaryFn,
  wrapNotebooklmAnswer,
} from "../../src/aggregate/notebooklm.js";
import { resolveYoutubeSummaryProvider } from "../../src/fulltest/summary-mode.js";

describe("notebooklm summary helpers", () => {
  it("wraps notebooklm answer with the original title", () => {
    expect(wrapNotebooklmAnswer("视频标题", "第一段\n第二段")).toBe(
      "**视频标题**\n\n第一段\n第二段",
    );
  });

  it("routes only youtube records to notebooklm", async () => {
    const fallback = vi.fn(async () => "**默认**\n\nfallback");
    const notebooklm = vi.fn(async () => "**标题**\n\nnotebooklm");
    const summaryFn = createYoutubeNotebooklmSummaryFn({
      fallback,
      notebooklmSummary: notebooklm,
    });

    const youtubeOut = await summaryFn({
      prompt: "p",
      source_type: "youtube",
      source_name: "yt",
      title: "video",
      content: "content",
      published_at: "2026-03-13T00:00:00.000Z",
      url: "https://www.youtube.com/watch?v=1",
    });
    const tgOut = await summaryFn({
      prompt: "p",
      source_type: "telegram",
      source_name: "tg",
      title: "post",
      content: "content",
      published_at: "2026-03-13T00:00:00.000Z",
      url: "https://example.com",
    });

    expect(youtubeOut).toContain("notebooklm");
    expect(tgOut).toContain("fallback");
    expect(notebooklm).toHaveBeenCalledTimes(1);
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it("serializes youtube notebooklm calls", async () => {
    const order: string[] = [];
    let releaseFirst: (() => void) | null = null;
    const fallback = vi.fn(async () => "**默认**\n\nfallback");
    const notebooklm = vi
      .fn()
      .mockImplementationOnce(
        async () =>
          await new Promise<string>((resolve) => {
            order.push("first-start");
            releaseFirst = () => {
              order.push("first-end");
              resolve("**A**\n\none");
            };
          }),
      )
      .mockImplementationOnce(async () => {
        order.push("second-start");
        return "**B**\n\ntwo";
      });

    const summaryFn = createYoutubeNotebooklmSummaryFn({
      fallback,
      notebooklmSummary: notebooklm,
    });

    const firstPromise = summaryFn({
      prompt: "p1",
      source_type: "youtube",
      source_name: "yt1",
      title: "video1",
      content: "content1",
      published_at: "2026-03-13T00:00:00.000Z",
      url: "https://www.youtube.com/watch?v=1",
    });
    const secondPromise = summaryFn({
      prompt: "p2",
      source_type: "youtube",
      source_name: "yt2",
      title: "video2",
      content: "content2",
      published_at: "2026-03-13T00:00:00.000Z",
      url: "https://www.youtube.com/watch?v=2",
    });

    await Promise.resolve();
    expect(order).toEqual(["first-start"]);

    releaseFirst?.();
    await firstPromise;
    await secondPromise;

    expect(order).toEqual(["first-start", "first-end", "second-start"]);
  });

  it("enables notebooklm mode from args or npm flag", () => {
    expect(resolveYoutubeSummaryProvider(["notebooklm"])).toBe("notebooklm");
    expect(resolveYoutubeSummaryProvider([], { npm_config_notebooklm: "true" })).toBe(
      "notebooklm",
    );
    expect(resolveYoutubeSummaryProvider([])).toBe("default");
  });
});
