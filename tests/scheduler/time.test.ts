import { describe, expect, it } from "vitest";
import {
  computeNextTriggerAt,
  parseClockHHMM,
  resolveUtcOffsetMinutes,
} from "../../src/scheduler/time.js";

describe("scheduler time helpers", () => {
  it("parses HH:MM clock format", () => {
    expect(parseClockHHMM("09:30")).toEqual({ hour: 9, minute: 30 });
  });

  it("resolves UTC+8 timezone aliases", () => {
    expect(resolveUtcOffsetMinutes("UTC+8")).toBe(480);
    expect(resolveUtcOffsetMinutes("+08:00")).toBe(480);
    expect(resolveUtcOffsetMinutes("Asia/Shanghai")).toBe(480);
  });

  it("computes trigger with 5-minute advance on same day", () => {
    const next = computeNextTriggerAt({
      now: new Date("2026-03-09T00:00:00.000Z"), // 08:00 UTC+8
      deliveryTime: "09:30",
      timezone: "UTC+8",
      leadMinutes: 5,
    });

    // 09:25 UTC+8 => 01:25 UTC
    expect(next.toISOString()).toBe("2026-03-09T01:25:00.000Z");
  });

  it("rolls over to next day after today's trigger passed", () => {
    const next = computeNextTriggerAt({
      now: new Date("2026-03-09T01:26:00.000Z"), // after 09:25 UTC+8
      deliveryTime: "09:30",
      timezone: "UTC+8",
      leadMinutes: 5,
    });

    expect(next.toISOString()).toBe("2026-03-10T01:25:00.000Z");
  });
});

