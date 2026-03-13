import { describe, expect, it } from "vitest";
import {
  buildYoutubeFeedJobs,
  formatJobWindow,
  normalizePlannedSources,
} from "../../src/youtube-v2/planner.js";

describe("youtube v2 planner", () => {
  it("builds separate default jobs for videos and streams", () => {
    const normalized = normalizePlannedSources([
      "https://www.youtube.com/@PeterYangYT",
    ]);

    const jobs = buildYoutubeFeedJobs(normalized.sources);

    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({
      feedKind: "videos",
      windowStartHoursAgo: 24,
      windowEndHoursAgo: 0,
    });
    expect(jobs[1]).toMatchObject({
      feedKind: "streams",
      windowStartHoursAgo: 96,
      windowEndHoursAgo: 72,
    });
    expect(formatJobWindow(jobs[0]!)).toBe("T-24h ~ T");
    expect(formatJobWindow(jobs[1]!)).toBe("T-96h ~ T-72h");
  });

  it("supports disabling streams and overriding videos window", () => {
    const normalized = normalizePlannedSources([
      "https://www.youtube.com/@PeterYangYT",
    ]);

    const jobs = buildYoutubeFeedJobs(normalized.sources, {
      videos: {
        windowStartHoursAgo: 12,
        windowEndHoursAgo: 0,
        maxCandidatesPerSource: 3,
      },
      streams: false,
    });

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      feedKind: "videos",
      windowStartHoursAgo: 12,
      windowEndHoursAgo: 0,
      maxCandidatesPerSource: 3,
    });
  });
});
