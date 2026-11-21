import { describe, expect, it } from "vitest";
import { parseAgreementDocument, type RuleLayer } from "../agreement/schema";
import { calculatePay } from "./index";
import { makeInput, shift } from "../../test/support";

/**
 * Overtime by clock hours after the planned shift, by time window before it
 * and on days off, and on Sundays/holidays (the structure of Industriens
 * Overenskomst § 13 stk. 7, with round test amounts).
 */
const A = { type: "ore_per_hour", ore: 1000 };
const B = { type: "ore_per_hour", ore: 2000 };
const C = { type: "ore_per_hour", ore: 3000 };
const X = { type: "ore_per_hour", ore: 4000 };

const overtime = (extra: Record<string, unknown> = {}): RuleLayer => ({
  id: "ot",
  primitive: "overtime",
  source: "x",
  params: {
    trigger: "outside_planned",
    tier_basis: "since_planned_end",
    tiers: [
      { up_to_minutes: 120, amount: A, pay_code: "OT_A" },
      { up_to_minutes: 120, amount: B, pay_code: "OT_B" },
      { up_to_minutes: null, amount: C, pay_code: "OT_C" },
    ],
    window_rates: [
      { days: ["sun", "holiday"], from: "06:00", to: "12:00", amount: X, pay_code: "OT_X" },
      { days: ["sun", "holiday"], from: "12:00", to: "06:00", amount: C, pay_code: "OT_C" },
      { days: ["sun", "holiday"], from: "00:00", to: "06:00", amount: C, pay_code: "OT_C" },
      {
        days: ["any"],
        from: "06:00",
        to: "18:00",
        when: "before_planned",
        amount: A,
        pay_code: "OT_A",
      },
      {
        days: ["any"],
        from: "18:00",
        to: "06:00",
        when: "before_planned",
        amount: C,
        pay_code: "OT_C",
      },
      { days: ["any"], from: "06:00", to: "18:00", when: "day_off", amount: B, pay_code: "OT_B" },
      { days: ["any"], from: "18:00", to: "06:00", when: "day_off", amount: C, pay_code: "OT_C" },
    ],
    ...extra,
  },
});

const doc = (rules: RuleLayer[]) =>
  parseAgreementDocument({
    id: "otw",
    name: "OTW",
    kind: "agreement",
    version: 1,
    valid_from: "2020-01-01",
    valid_to: null,
    inherits_from: "test-base",
    source: "unit test",
    rules: [
      {
        id: "sats",
        primitive: "pay_rate",
        source: "x",
        params: { pay_code: "NORMAL", rates: [{ hourly_ore: 15000 }] },
      },
      ...rules,
    ],
  });

function run(
  worked: ReturnType<typeof shift>[],
  planned: ReturnType<typeof shift>[],
  from: string,
  to: string,
  rules: RuleLayer[] = [overtime()],
) {
  return calculatePay({
    ...makeInput({ extraDocs: [doc(rules)], agreementId: "otw" }),
    worked,
    planned,
    period: { from, to },
  });
}

const minutes = (r: ReturnType<typeof calculatePay>, unit = "hours") => {
  const out: Record<string, number> = {};
  for (const l of r.lines)
    if (l.payCode.startsWith("OT") && l.unit === unit)
      out[l.payCode] = (out[l.payCode] ?? 0) + l.quantityMinutes;
  return out;
};

describe("overtime by clock hours and windows", () => {
  it("counts clock hours from the planned end, also when overtime starts later (§ 13 stk. 7 example)", () => {
    // Normal day ends 15:00; overtime 16–19: one hour as 2nd clock hour, two as 3rd and 4th.
    const p = shift("2026-01-05 07:00", "2026-01-05 15:00", { id: "p" });
    const r = run(
      [
        shift("2026-01-05 07:00", "2026-01-05 15:00", { plannedShiftId: "p" }),
        shift("2026-01-05 16:00", "2026-01-05 19:00"),
      ],
      [p],
      "2026-01-05",
      "2026-01-05",
    );
    expect(minutes(r)).toEqual({ OT_A: 60, OT_B: 120 });
  });

  it("continues past midnight without starting over", () => {
    const p = shift("2026-01-05 14:00", "2026-01-05 22:00", { id: "p" });
    const r = run(
      [shift("2026-01-05 14:00", "2026-01-06 03:00", { plannedShiftId: "p" })],
      [p],
      "2026-01-05",
      "2026-01-06",
    );
    expect(minutes(r)).toEqual({ OT_A: 120, OT_B: 120, OT_C: 60 });
  });

  it("overtime before the shift is paid by time window", () => {
    const p = shift("2026-01-05 07:00", "2026-01-05 15:00", { id: "p" });
    const r = run(
      [shift("2026-01-05 05:00", "2026-01-05 15:00", { plannedShiftId: "p" })],
      [p],
      "2026-01-05",
      "2026-01-05",
    );
    expect(minutes(r)).toEqual({ OT_C: 60, OT_A: 60 });
  });

  it("a day without a planned shift uses the day-off windows", () => {
    // Saturday 10 January 2026.
    const r = run([shift("2026-01-10 08:00", "2026-01-10 20:00")], [], "2026-01-10", "2026-01-10");
    expect(minutes(r)).toEqual({ OT_B: 600, OT_C: 120 });
  });

  it("Sundays and holidays have their own windows", () => {
    const sunday = run(
      [shift("2026-01-11 08:00", "2026-01-11 14:00")],
      [],
      "2026-01-11",
      "2026-01-11",
    );
    expect(minutes(sunday)).toEqual({ OT_X: 240, OT_C: 120 });
    // Langfredag 3 April 2026 (a Friday).
    const holiday = run(
      [shift("2026-04-03 08:00", "2026-04-03 10:00")],
      [],
      "2026-04-03",
      "2026-04-03",
    );
    expect(minutes(holiday)).toEqual({ OT_X: 120 });
  });

  it("amounts are minutes × supplement", () => {
    const r = run([shift("2026-01-11 08:00", "2026-01-11 10:00")], [], "2026-01-11", "2026-01-11");
    expect(r.lines.find((l) => l.payCode === "OT_X")!.amountOre).toBe(8000);
  });

  it("payout_and_time_off pays the supplement and earns the hours as time off", () => {
    const p = shift("2026-01-05 07:00", "2026-01-05 15:00", { id: "p" });
    const r = run(
      [shift("2026-01-05 07:00", "2026-01-05 18:00", { plannedShiftId: "p" })],
      [p],
      "2026-01-05",
      "2026-01-05",
      [overtime({ compensation: "payout_and_time_off", time_off_pay_code: "OT_AFSP" })],
    );
    expect(minutes(r)).toEqual({ OT_A: 120, OT_B: 60 });
    expect(minutes(r, "time_off_minutes")).toEqual({ OT_AFSP: 180 });
    expect(r.lines.find((l) => l.payCode === "OT_AFSP")!.amountOre).toBe(0);
  });

  it("without window rates and with the default basis, tiers count overtime minutes as before", () => {
    const p = shift("2026-01-05 07:00", "2026-01-05 15:00", { id: "p" });
    const r = run(
      [
        shift("2026-01-05 07:00", "2026-01-05 15:00", { plannedShiftId: "p" }),
        shift("2026-01-05 16:00", "2026-01-05 19:00"),
      ],
      [p],
      "2026-01-05",
      "2026-01-05",
      [overtime({ tier_basis: "overtime_minutes", window_rates: [] })],
    );
    expect(minutes(r)).toEqual({ OT_A: 120, OT_B: 60 });
  });
});

describe("windows and the norm", () => {
  const supplement = (window: Record<string, unknown>): RuleLayer => ({
    id: "t3",
    primitive: "time_window_supplement",
    source: "x",
    params: {
      windows: [{ days: ["any"], from: "00:00", to: "06:00", ...window }],
      amount: { type: "ore_per_hour", ore: 1000 },
      pay_code: "T3",
    },
  });
  const t3 = (r: ReturnType<typeof calculatePay>) =>
    r.lines.filter((l) => l.payCode === "T3").reduce((s, l) => s + l.quantityMinutes, 0);

  it('started_at_or_after includes a shift starting exactly then ("kl. 24 eller derefter")', () => {
    const rules = [supplement({ started_at_or_after: "00:00" })];
    const at = run(
      [shift("2026-01-06 00:00", "2026-01-06 08:00")],
      [],
      "2026-01-06",
      "2026-01-06",
      rules,
    );
    expect(t3(at)).toBe(360);
    const before = run(
      [shift("2026-01-05 22:00", "2026-01-06 06:00")],
      [],
      "2026-01-05",
      "2026-01-06",
      rules,
    );
    expect(t3(before)).toBe(0);
    const strict = run(
      [shift("2026-01-06 00:00", "2026-01-06 08:00")],
      [],
      "2026-01-06",
      "2026-01-06",
      [supplement({ started_after: "00:00" })],
    );
    expect(t3(strict)).toBe(0);
  });

  it("holiday_reduction takes 1/5 of the weekly norm for a holiday on Monday–Friday", () => {
    // Week of Kristi himmelfartsdag (Thursday 14 May 2026): 37 h → 29.6 h.
    const rules = (reduction: string): RuleLayer[] => [
      {
        id: "ot",
        primitive: "overtime",
        source: "x",
        params: {
          trigger: "weekly_norm",
          tiers: [{ up_to_minutes: null, amount: A, pay_code: "OT_A" }],
        },
      },
      {
        id: "norm",
        primitive: "norm",
        source: "x",
        params: { period: { type: "week" }, holiday_reduction: reduction },
      },
    ];
    const days = ["11", "12", "13", "15"].map((d) =>
      shift(`2026-05-${d} 07:00`, `2026-05-${d} 15:00`),
    ); // 32 h
    const reduced = run(days, [], "2026-05-11", "2026-05-17", rules("one_fifth_on_weekdays"));
    expect(minutes(reduced)).toEqual({ OT_A: 144 }); // 32 h − 29 h 36 min
    const plain = run(days, [], "2026-05-11", "2026-05-17", rules("none"));
    expect(minutes(plain)).toEqual({});
  });
});
