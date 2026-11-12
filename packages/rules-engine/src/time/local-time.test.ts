import { describe, expect, it } from "vitest";
import {
  addDays,
  isoWeekStart,
  isoWeekday,
  localDayLengthMinutes,
  localDaysOverlapping,
  parseInstant,
  startOfLocalDay,
  toLocal,
  wallTime,
} from "./local-time";

const TZ = "Europe/Copenhagen";
const H = 3_600_000;

describe("parseInstant", () => {
  it("parses ISO instants with offset or Z", () => {
    expect(parseInstant("2026-01-01T00:00:00Z")).toBe(Date.UTC(2026, 0, 1));
    expect(parseInstant("2026-01-01T01:00:00+01:00")).toBe(Date.UTC(2026, 0, 1));
  });
  it("rejects local times without zone", () => {
    expect(() => parseInstant("2026-01-01T00:00:00")).toThrow();
  });
});

describe("toLocal", () => {
  it("converts winter time (UTC+1)", () => {
    expect(toLocal(Date.UTC(2026, 0, 5, 7, 30), TZ)).toEqual({
      date: "2026-01-05",
      minuteOfDay: 510,
      weekday: 1,
    });
  });
  it("converts summer time (UTC+2)", () => {
    expect(toLocal(Date.UTC(2026, 6, 5, 22, 30), TZ)).toEqual({
      date: "2026-07-06",
      minuteOfDay: 30,
      weekday: 1,
    });
  });
});

describe("local days and DST", () => {
  it("spring forward day has 23 hours, fall back day 25", () => {
    expect(localDayLengthMinutes("2026-03-29", TZ)).toBe(23 * 60);
    expect(localDayLengthMinutes("2026-10-25", TZ)).toBe(25 * 60);
    expect(localDayLengthMinutes("2026-06-01", TZ)).toBe(24 * 60);
  });

  it("startOfLocalDay is local midnight", () => {
    expect(startOfLocalDay("2026-03-29", TZ)).toBe(Date.UTC(2026, 2, 28, 23));
    expect(startOfLocalDay("2026-03-30", TZ)).toBe(Date.UTC(2026, 2, 29, 22));
  });

  it("wallTime resolves local clock times, incl. 24:00 and non-existent times", () => {
    expect(wallTime("2026-01-05", "18:00", TZ)).toBe(Date.UTC(2026, 0, 5, 17));
    expect(wallTime("2026-01-05", "24:00", TZ)).toBe(startOfLocalDay("2026-01-06", TZ));
    // 02:30 does not exist on 29 March 2026; "compatible" moves it forward.
    expect(wallTime("2026-03-29", "02:30", TZ)).toBe(Date.UTC(2026, 2, 29, 1, 30));
  });

  it("lists local days overlapping an interval (end exclusive)", () => {
    const start = wallTime("2026-01-05", "22:00", TZ);
    expect(localDaysOverlapping(start, start + 4 * H, TZ)).toEqual(["2026-01-05", "2026-01-06"]);
    expect(localDaysOverlapping(start, start + 2 * H, TZ)).toEqual(["2026-01-05"]);
  });
});

describe("calendar dates", () => {
  it("adds days and finds ISO weekday / week start", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(isoWeekday("2026-11-15")).toBe(7);
    expect(isoWeekStart("2026-11-15")).toBe("2026-11-09");
    expect(isoWeekStart("2026-11-09")).toBe("2026-11-09");
  });
});
