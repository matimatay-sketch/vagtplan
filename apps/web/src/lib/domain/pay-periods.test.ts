import { describe, expect, it } from "vitest";
import { payPeriodsFrom } from "./pay-periods";

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
