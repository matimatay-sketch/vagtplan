import { describe, expect, it } from "vitest";
import { parseAgreementDocument, type AgreementRegistry } from "@vagtplan/rules-engine";
import { compareTestCase, runTestCase, type TestCase } from "./test-weeks";

const base = parseAgreementDocument({
  id: "base",
  name: "Base",
  kind: "base",
  version: 1,
  valid_from: "2020-01-01",
  valid_to: null,
  inherits_from: null,
  source: "Lov",
  rules: [
    {
      id: "hviletid",
      primitive: "rest",
      source: "Lov",
      params: { daily_minutes: 660, weekly_minutes: 1440, weekly_period: "calendar_week" },
    },
  ],
});
const agreement = parseAgreementDocument({
  id: "detail",
  name: "Detail",
  kind: "agreement",
  version: 1,
  valid_from: "2026-01-01",
  valid_to: null,
  inherits_from: "base",
  source: "OK",
  rules: [
    {
      id: "loen",
      primitive: "pay_rate",
      source: "§ 1",
      params: { pay_code: "NORMAL", rates: [{ hourly_ore: 15000 }] },
    },
    {
      id: "aften",
      primitive: "time_window_supplement",
      source: "§ 4",
      params: {
        windows: [{ days: ["weekday"], from: "18:00", to: "24:00" }],
        amount: { type: "ore_per_hour", ore: 3000 },
        pay_code: "AFTEN",
      },
    },
  ],
});
const local = parseAgreementDocument({
  id: "lokal",
  name: "Lokal",
  kind: "local",
  version: 1,
  valid_from: "2026-01-01",
  valid_to: null,
  inherits_from: "detail",
  source: "Lokal",
  rules: [{ id: "aften", params: { amount: { type: "ore_per_hour", ore: 4000 } } }],
});
const registry: AgreementRegistry = { base: [base], detail: [agreement], lokal: [local] };

const week: TestCase = {
  name: "Aftenvagt",
  weekStart: "2026-01-05",
  employee: { birthDate: "1990-01-01", schoolObligated: false },
  contract: { payForm: "hourly", weeklyNormMinutes: 2220, staffGroup: null, payStep: null },
  // Tuesday 14–22 without a break: 8 hours, of which 4 in the evening window.
  shifts: [{ date: "2026-01-06", start: "14:00", end: "22:00", breakMinutes: 0, kind: "work" }],
  absences: [],
  expected: {
    lines: [
      { payCode: "AFTEN", minutes: 240, amountOre: 12000 },
      { payCode: "NORMAL", minutes: 480, amountOre: 120000 },
    ],
    violations: [],
  },
};

describe("test weeks", () => {
  it("runs a week on the agreement and sums lines per pay code", () => {
    const r = runTestCase(registry, "detail", week, "Europe/Copenhagen");
    expect(r.lines).toEqual(week.expected.lines);
    expect(r.violations).toEqual([]);
    expect(compareTestCase(r, week.expected)).toEqual({
      ok: true,
      lines: [],
      violations: { missing: [], unexpected: [] },
    });
  });

  it("a local agreement is run on top of the agreement it inherits from", () => {
    const r = runTestCase(registry, "lokal", week, "Europe/Copenhagen");
    expect(r.lines.find((l) => l.payCode === "AFTEN")).toEqual({
      payCode: "AFTEN",
      minutes: 240,
      amountOre: 16000,
    });
  });

  it("reports what differs: amounts, minutes, missing and extra pay codes, violations", () => {
    const r = runTestCase(registry, "lokal", week, "Europe/Copenhagen");
    const c = compareTestCase(r, {
      lines: [
        { payCode: "AFTEN", minutes: 240, amountOre: 12000 },
        { payCode: "GARANTI", minutes: 60, amountOre: 15000 },
      ],
      violations: ["REST_DAILY"],
    });
    expect(c.ok).toBe(false);
    expect(c.lines).toEqual([
      {
        payCode: "AFTEN",
        expected: { minutes: 240, amountOre: 12000 },
        actual: { minutes: 240, amountOre: 16000 },
      },
      { payCode: "GARANTI", expected: { minutes: 60, amountOre: 15000 }, actual: null },
      { payCode: "NORMAL", expected: null, actual: { minutes: 480, amountOre: 120000 } },
    ]);
    expect(c.violations).toEqual({ missing: ["REST_DAILY"], unexpected: [] });
  });

  it("night shifts end the next day and breaks are deducted; rest violations are found", () => {
    const r = runTestCase(
      registry,
      "detail",
      {
        ...week,
        shifts: [
          { date: "2026-01-05", start: "22:00", end: "06:00", breakMinutes: 30, kind: "work" },
          { date: "2026-01-06", start: "12:00", end: "16:00", breakMinutes: 0, kind: "work" },
        ],
      },
      "Europe/Copenhagen",
    );
    // 8 h − 30 min + 4 h = 11.5 h normal; rest 06:00–12:00 is 6 h.
    expect(r.lines.find((l) => l.payCode === "NORMAL")!.minutes).toBe(690);
    expect(r.violations).toContain("REST_DAILY");
  });
});
