import { describe, expect, it } from "vitest";
import {
  buildChannelTabUrls,
  buildChannelVideosUrl,
  buildVideoUrl,
  normalizeSourceUrl,
  sourceNameFromUrl,
} from "../../src/youtube/url.js";

describe("youtube url helpers", () => {
  it("normalizes channel urls", () => {
    expect(normalizeSourceUrl("www.youtube.com/@Messari/")).toBe(
      "https://www.youtube.com/@Messari",
    );
  });

  it("builds channel videos url", () => {
    expect(buildChannelVideosUrl("https://www.youtube.com/@PeterYangYT")).toBe(
      "https://www.youtube.com/@PeterYangYT/videos",
    );
  });

  it("builds channel tab urls with streams probe", () => {
    expect(buildChannelTabUrls("https://www.youtube.com/@TraderXO")).toEqual([
      "https://www.youtube.com/@TraderXO/videos",
      "https://www.youtube.com/@TraderXO/streams",
    ]);
  });

  it("extracts source name from handle", () => {
    expect(sourceNameFromUrl("https://www.youtube.com/@PeterYangYT")).toBe(
      "PeterYangYT",
    );
  });

  it("extracts source name from tabbed channel urls", () => {
    expect(sourceNameFromUrl("https://www.youtube.com/@PeterYangYT/streams")).toBe(
      "PeterYangYT",
    );
    expect(sourceNameFromUrl("https://www.youtube.com/@PeterYangYT/live")).toBe(
      "PeterYangYT",
    );
  });

  it("normalizes video urls from id or short url", () => {
    expect(buildVideoUrl("1B3Ffo8snfY")).toBe(
      "https://www.youtube.com/watch?v=1B3Ffo8snfY",
    );
    expect(buildVideoUrl("https://youtu.be/1B3Ffo8snfY")).toBe(
      "https://www.youtube.com/watch?v=1B3Ffo8snfY",
    );
  });
});
