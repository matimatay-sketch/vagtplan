import { describe, expect, it } from "vitest";
import { payPeriodsFrom, periodFocus } from "./pay-periods";

describe("payPeriodsFrom", () => {
  it("monthly from day 1 follows calendar months", () => {
    expect(
      payPeriodsFrom(
        { frequency: "monthly", month_start_day: 1, anchor_date: null },
        "2026-02-10",
        3,
      ),
    ).toEqual([
      { start: "2026-02-01", end: "2026-02-28" },
      { start: "2026-03-01", end: "2026-03-31" },
      { start: "2026-04-01", end: "2026-04-30" },
    ]);
  });

  it("monthly shifted period 21st–20th", () => {
    expect(
      payPeriodsFrom(
        { frequency: "monthly", month_start_day: 21, anchor_date: null },
        "2026-12-05",
        2,
      ),
    ).toEqual([
      { start: "2026-11-21", end: "2026-12-20" },
      { start: "2026-12-21", end: "2027-01-20" },
    ]);
  });

  it("biweekly aligns to the anchor, also for dates before the anchor", () => {
    const g = { frequency: "biweekly" as const, anchor_date: "2026-01-05", month_start_day: null };
    expect(payPeriodsFrom(g, "2026-01-20", 2)).toEqual([
      { start: "2026-01-19", end: "2026-02-01" },
      { start: "2026-02-02", end: "2026-02-15" },
    ]);
    expect(payPeriodsFrom(g, "2026-01-04", 1)).toEqual([
      { start: "2025-12-22", end: "2026-01-04" },
    ]);
  });

  it("weekly spans Monday–Sunday across a DST change and year end", () => {
    const g = { frequency: "weekly" as const, anchor_date: "2026-01-05", month_start_day: null };
    expect(payPeriodsFrom(g, "2026-03-29", 1)).toEqual([
      { start: "2026-03-23", end: "2026-03-29" },
    ]);
    expect(payPeriodsFrom(g, "2026-12-31", 2)).toEqual([
      { start: "2026-12-28", end: "2027-01-03" },
      { start: "2027-01-04", end: "2027-01-10" },
    ]);
  });
});

describe("periodFocus", () => {
  const p = (groupId: string, start: string, end: string, status: "open" | "closed" = "open") =>
    ({ groupId, start, end, status }) as const;
  const today = "2026-11-20";

  it("puts the oldest ended, unclosed period first per group, else the running one", () => {
    const rows = [
      p("hourly", "2026-11-23", "2026-12-06"),
      p("hourly", "2026-11-09", "2026-11-22"),
      p("hourly", "2026-10-26", "2026-11-08"),
      p("hourly", "2026-10-12", "2026-10-25", "closed"),
      p("monthly", "2026-11-01", "2026-11-30"),
      p("monthly", "2026-10-01", "2026-10-31", "closed"),
    ];
    const r = periodFocus(rows, today);
    expect(r.now.map((x) => [x.groupId, x.start, x.state])).toEqual([
      ["hourly", "2026-10-26", "ready"],
      ["monthly", "2026-11-01", "running"],
    ]);
  });

  it("lists the last three months and the next month; older periods are counted", () => {
    const rows = [
      p("m", "2026-12-01", "2026-12-31"),
      p("m", "2027-01-01", "2027-01-31"),
      p("m", "2026-08-01", "2026-08-31", "closed"),
      p("m", "2026-07-01", "2026-07-31", "closed"),
    ];
    const r = periodFocus(rows, today);
    // Three months back is 20 Aug: August ends after it and stays; July is older.
    expect(r.recent.map((x) => x.start)).toEqual(["2026-12-01", "2026-08-01"]);
    expect(r.older).toBe(1);
  });
});
