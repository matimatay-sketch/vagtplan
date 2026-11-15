import { describe, expect, it } from "vitest";
import { testCaseSchema } from "./test-week";

const valid = {
  name: " Aftenvagt ",
  weekStart: "2026-01-05",
  employee: { birthDate: "1990-01-01", schoolObligated: false },
  contract: { payForm: "hourly", weeklyNormMinutes: 2220, staffGroup: "", payStep: null },
  shifts: [{ date: "2026-01-06", start: "14:00", end: "22:00", breakMinutes: 0, kind: "work" }],
  absences: [],
  expected: {
    lines: [{ payCode: "AFTEN", minutes: 240, amountOre: 12000 }],
    violations: ["REST_DAILY"],
  },
};

describe("testCaseSchema", () => {
  it("accepts a test week and normalizes empty text", () => {
    const r = testCaseSchema.parse(valid);
    expect(r.name).toBe("Aftenvagt");
    expect(r.contract.staffGroup).toBeNull();
  });
  it("the week starts on a Monday and shifts lie in the week", () => {
    expect(testCaseSchema.safeParse({ ...valid, weekStart: "2026-01-06" }).success).toBe(false);
    expect(
      testCaseSchema.safeParse({ ...valid, shifts: [{ ...valid.shifts[0], date: "2026-01-12" }] })
        .success,
    ).toBe(false);
  });
  it("needs at least one expected pay line or violation, and valid codes", () => {
    expect(
      testCaseSchema.safeParse({ ...valid, expected: { lines: [], violations: [] } }).success,
    ).toBe(false);
    expect(
      testCaseSchema.safeParse({
        ...valid,
        expected: { lines: [{ payCode: "aften", minutes: 1, amountOre: 1 }], violations: [] },
      }).success,
    ).toBe(false);
  });
});
