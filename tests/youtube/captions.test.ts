import { describe, expect, it } from "vitest";
import {
  parseJson3Captions,
  parseVttCaptions,
  selectCaptionTrack,
} from "../../src/youtube/captions.js";

describe("youtube caption helpers", () => {
  it("prefers manual english json3 captions", () => {
    const track = selectCaptionTrack([
      { url: "auto-vtt", language: "en", ext: "vtt", kind: "auto" },
      { url: "manual-json3", language: "en", ext: "json3", kind: "manual" },
      { url: "manual-vtt", language: "fr", ext: "vtt", kind: "manual" },
    ]);

    expect(track?.url).toBe("manual-json3");
  });

  it("parses json3 captions into plain text", () => {
    const raw = JSON.stringify({
      events: [
        { segs: [{ utf8: "Hello " }, { utf8: "world" }] },
        { segs: [{ utf8: "This is &amp;nbsp; a test." }] },
      ],
    });

    expect(parseJson3Captions(raw)).toBe("Hello world This is a test.");
  });

  it("parses vtt captions into plain text", () => {
    const raw = `WEBVTT

00:00:00.000 --> 00:00:01.000
<c.colorE5E5E5>Hello</c>

00:00:01.000 --> 00:00:02.000
world
`;

    expect(parseVttCaptions(raw)).toBe("Hello world");
  });
});
