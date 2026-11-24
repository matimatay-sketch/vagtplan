import { describe, expect, it } from "vitest";
import { DAYPARTS, daypartOf } from "./daypart";

describe("daypartOf", () => {
  it("uses the local start time in Copenhagen (winter, UTC+1)", () => {
    expect(daypartOf("2026-12-07T04:59:00Z")).toBe("night"); // 05:59
    expect(daypartOf("2026-12-07T05:00:00Z")).toBe("morning"); // 06:00
    expect(daypartOf("2026-12-07T09:59:00Z")).toBe("morning"); // 10:59
    expect(daypartOf("2026-12-07T10:00:00Z")).toBe("day"); // 11:00
    expect(daypartOf("2026-12-07T13:59:00Z")).toBe("day"); // 14:59
    expect(daypartOf("2026-12-07T14:00:00Z")).toBe("evening"); // 15:00
    expect(daypartOf("2026-12-07T19:59:00Z")).toBe("evening"); // 20:59
    expect(daypartOf("2026-12-07T20:00:00Z")).toBe("night"); // 21:00
    expect(daypartOf("2026-12-07T23:00:00Z")).toBe("night"); // 00:00
  });

  it("follows summer time (UTC+2)", () => {
    expect(daypartOf("2026-07-01T04:00:00Z")).toBe("morning"); // 06:00
    expect(daypartOf("2026-07-01T03:59:00Z")).toBe("night"); // 05:59
    expect(daypartOf("2026-07-01T19:00:00Z")).toBe("night"); // 21:00
  });

  it("handles the nights the clocks change", () => {
    // 29 March 2026: 02:00 → 03:00. 04:00 UTC is 06:00 local.
    expect(daypartOf("2026-03-29T04:00:00Z")).toBe("morning");
    expect(daypartOf("2026-03-29T03:59:00Z")).toBe("night");
    // 25 October 2026: 03:00 → 02:00. 05:00 UTC is 06:00 local.
    expect(daypartOf("2026-10-25T05:00:00Z")).toBe("morning");
    expect(daypartOf("2026-10-25T04:59:00Z")).toBe("night");
  });

  it("lists the parts in the order of the day, with their start times", () => {
    expect(DAYPARTS.map((d) => `${d.part} ${d.from}`)).toEqual([
      "morning 06:00",
      "day 11:00",
      "evening 15:00",
      "night 21:00",
    ]);
  });
});
