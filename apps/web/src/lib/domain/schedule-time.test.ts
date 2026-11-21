import { describe, expect, it } from "vitest";
import {
  barPosition,
  isoWeekNumber,
  localParts,
  shiftWhen,
  weekDates,
  weekStartOf,
} from "./schedule-time";

describe("week helpers", () => {
  it("lists Monday–Sunday and finds the week start", () => {
    expect(weekDates("2026-12-28")).toEqual([
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
      "2027-01-03",
    ]);
    expect(weekStartOf("2027-01-03")).toBe("2026-12-28");
  });

  it("computes ISO week numbers across year boundaries", () => {
    expect(isoWeekNumber("2026-01-01")).toBe(1);
    expect(isoWeekNumber("2026-12-28")).toBe(53);
    expect(isoWeekNumber("2027-01-04")).toBe(1);
    expect(isoWeekNumber("2027-01-03")).toBe(53);
  });
});

describe("localParts", () => {
  it("shows Copenhagen wall time in winter and summer", () => {
    expect(localParts("2026-01-05T07:00:00Z")).toEqual({ date: "2026-01-05", time: "08:00" });
    expect(localParts("2026-07-05T22:30:00Z")).toEqual({ date: "2026-07-06", time: "00:30" });
  });
});

describe("barPosition (day view)", () => {
  it("positions a shift on a normal day", () => {
    expect(barPosition("2026-01-05T07:00:00Z", "2026-01-05T15:00:00Z", "2026-01-05")).toEqual({
      left: 8 / 24,
      width: 8 / 24,
      clippedStart: false,
      clippedEnd: false,
    });
  });

  it("clips a shift that continues past midnight", () => {
    const p = barPosition("2026-01-05T21:00:00Z", "2026-01-06T05:00:00Z", "2026-01-05");
    expect(p).toEqual({ left: 22 / 24, width: 2 / 24, clippedStart: false, clippedEnd: true });
  });

  it("uses real time on the 23-hour DST day", () => {
    // 29 March 2026: 00:00–06:00 local is 5 real hours of a 23-hour day.
    const p = barPosition("2026-03-28T23:00:00Z", "2026-03-29T04:00:00Z", "2026-03-29");
    expect(p!.left).toBe(0);
    expect(p!.width).toBeCloseTo(5 / 23, 10);
  });

  it("returns null for a shift on another day", () => {
    expect(barPosition("2026-01-06T07:00:00Z", "2026-01-06T15:00:00Z", "2026-01-05")).toBeNull();
  });
});

describe("shiftWhen", () => {
  it("shows the Copenhagen day and times, also across summer time", () => {
    // 27 Nov 2026 is winter time (UTC+1); 26 Jun 2026 summer time (UTC+2).
    expect(shiftWhen("2026-11-27T07:00:00Z", "2026-11-27T13:00:00Z")).toMatch(
      /27\. nov\.? 08:00–14:00$/,
    );
    expect(shiftWhen("2026-06-26T20:00:00Z", "2026-06-27T04:00:00Z")).toMatch(
      /26\. jun\.? 22:00–06:00 \(\+1\)$/,
    );
  });
});
