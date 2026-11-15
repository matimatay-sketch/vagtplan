import { describe, expect, it } from "vitest";
import { deviation, entryMinutes, needsReason } from "./time-entries";

const plan = { start: "2026-11-10T07:00:00.000Z", end: "2026-11-10T15:00:00.000Z" };

describe("deviation", () => {
  it("is the difference at start and end in minutes (positive = more time)", () => {
    expect(
      deviation({ start: "2026-11-10T06:50:00.000Z", end: "2026-11-10T15:30:00.000Z" }, plan),
    ).toEqual({
      start: 10,
      end: 30,
      total: 40,
    });
    expect(
      deviation({ start: "2026-11-10T07:15:00.000Z", end: "2026-11-10T14:00:00.000Z" }, plan),
    ).toEqual({
      start: -15,
      end: -60,
      total: -75,
    });
  });
});

describe("needsReason", () => {
  it("a registration without a plan or with other times than planned needs a reason", () => {
    expect(needsReason(plan, plan)).toBe(false);
    expect(needsReason({ ...plan, end: "2026-11-10T15:01:00.000Z" }, plan)).toBe(true);
    expect(needsReason(plan, null)).toBe(true);
  });
});

describe("entryMinutes", () => {
  it("is the length minus unpaid breaks", () => {
    expect(
      entryMinutes({
        ...plan,
        breaks: [
          { start_at: null, minutes: 30, paid: false },
          { start_at: null, minutes: 15, paid: true },
        ],
      }),
    ).toBe(450);
  });
  it("an open registration has no length yet", () => {
    expect(entryMinutes({ start: plan.start, end: null, breaks: [] })).toBeNull();
  });
});
