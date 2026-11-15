import { describe, expect, it } from "vitest";
import { vacationAccrual } from "./index";

const rule = {
  days_per_month: 2.08,
  holiday_year_start: "09-01",
  usage_extends_months: 4,
  main_holiday: { min_consecutive_days: 15, from: "05-01", to: "09-30" },
  vacation_pay_bp: null,
  vacation_supplement_bp: null,
  special_vacation_pay_bp: null,
  extra_days: { days_per_year: 5, year_start: "05-01", accrual: "upfront" as const },
};

describe("vacationAccrual", () => {
  it("accrues 2.08 days per full month as ledger postings with holiday year and expiry", () => {
    const entries = vacationAccrual(
      rule,
      { employedFrom: "2026-08-01", employedTo: null },
      "2026-10-31",
    );
    const ferie = entries.filter((e) => e.kind === "vacation");
    expect(ferie.map((e) => [e.date, e.days, e.holidayYear, e.usableUntil])).toEqual([
      ["2026-08-31", 2.08, "2025-09-01", "2026-12-31"],
      ["2026-09-30", 2.08, "2026-09-01", "2027-12-31"],
      ["2026-10-31", 2.08, "2026-09-01", "2027-12-31"],
    ]);
  });

  it("a full holiday year gives 25 days (rounded)", () => {
    const entries = vacationAccrual(
      rule,
      { employedFrom: "2025-09-01", employedTo: null },
      "2026-08-31",
    );
    const total = entries.filter((e) => e.kind === "vacation").reduce((s, e) => s + e.days, 0);
    expect(Math.round(total)).toBe(25);
  });

  it("a partial first month is prorated by calendar days", () => {
    const entries = vacationAccrual(
      rule,
      { employedFrom: "2026-09-16", employedTo: null },
      "2026-09-30",
    );
    expect(entries.filter((e) => e.kind === "vacation")[0]!.days).toBeCloseTo(1.04, 2);
  });

  it("extra days (feriefridage) are granted upfront each year", () => {
    const entries = vacationAccrual(
      rule,
      { employedFrom: "2025-01-01", employedTo: null },
      "2026-06-30",
    );
    expect(entries.filter((e) => e.kind === "extra").map((e) => [e.date, e.days])).toEqual([
      ["2025-05-01", 5],
      ["2026-05-01", 5],
    ]);
  });

  it("stops at the end of employment", () => {
    const entries = vacationAccrual(
      rule,
      { employedFrom: "2026-01-01", employedTo: "2026-02-14" },
      "2026-12-31",
    );
    const ferie = entries.filter((e) => e.kind === "vacation");
    expect(ferie).toHaveLength(2);
    expect(ferie[1]!.days).toBeCloseTo(1.04, 2);
  });
});
