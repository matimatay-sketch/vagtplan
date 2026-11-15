import { describe, expect, it } from "vitest";
import { balances, formatDays, planUsage, type Posting } from "./leave";

const p = (over: Partial<Posting>): Posting => ({
  account: "vacation",
  kind: "accrual",
  periodStart: "2025-09-01",
  usableUntil: "2026-12-31",
  hundredths: 208,
  ...over,
});

describe("balances", () => {
  it("sums postings per account and period: earned, used and balance", () => {
    expect(
      balances([
        p({}),
        p({}),
        p({ kind: "usage", hundredths: -300 }),
        p({ kind: "reversal", hundredths: 100 }),
        p({ periodStart: "2026-09-01", usableUntil: "2027-12-31" }),
        p({
          account: "care_day",
          periodStart: "2026-01-01",
          usableUntil: "2026-12-31",
          hundredths: 200,
        }),
      ]),
    ).toEqual([
      {
        account: "care_day",
        periodStart: "2026-01-01",
        usableUntil: "2026-12-31",
        earned: 200,
        used: 0,
        other: 0,
        balance: 200,
      },
      {
        account: "vacation",
        periodStart: "2025-09-01",
        usableUntil: "2026-12-31",
        earned: 416,
        used: 200,
        other: 0,
        balance: 216,
      },
      {
        account: "vacation",
        periodStart: "2026-09-01",
        usableUntil: "2027-12-31",
        earned: 208,
        used: 0,
        other: 0,
        balance: 208,
      },
    ]);
  });
});

describe("planUsage", () => {
  const periods = [
    { periodStart: "2026-09-01", usableUntil: "2027-12-31", balance: 1000 },
    { periodStart: "2025-09-01", usableUntil: "2026-12-31", balance: 300 },
  ];
  const fallback = { periodStart: "2026-09-01", usableUntil: "2027-12-31" };

  it("draws from the period that expires first", () => {
    expect(planUsage(periods, 500, "2026-11-02", fallback)).toEqual([
      { periodStart: "2025-09-01", usableUntil: "2026-12-31", hundredths: -300 },
      { periodStart: "2026-09-01", usableUntil: "2027-12-31", hundredths: -200 },
    ]);
  });
  it("skips expired periods and goes negative in the fallback period (vacation in advance)", () => {
    expect(planUsage(periods, 1200, "2027-02-01", fallback)).toEqual([
      { periodStart: "2026-09-01", usableUntil: "2027-12-31", hundredths: -1200 },
    ]);
  });
  it("nothing to draw for zero days", () => {
    expect(planUsage(periods, 0, "2026-11-02", fallback)).toEqual([]);
  });
});

describe("formatDays", () => {
  it("formats hundredths as Danish decimals without floats", () => {
    expect(formatDays(208)).toBe("2,08");
    expect(formatDays(2500)).toBe("25");
    expect(formatDays(-50)).toBe("−0,5");
    expect(formatDays(0)).toBe("0");
  });
});
