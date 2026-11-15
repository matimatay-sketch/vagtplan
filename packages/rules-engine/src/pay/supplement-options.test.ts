import { describe, expect, it } from "vitest";
import { parseAgreementDocument, type RuleLayer } from "../agreement/schema";
import { calculatePay } from "./index";
import { makeInput, shift } from "../../test/support";

/** No pay_rate: supplements in kr. must still be paid. All amounts are test values. */
const doc = (rules: RuleLayer[]) =>
  parseAgreementDocument({
    id: "supp-test",
    name: "Tillæg",
    kind: "agreement",
    version: 1,
    valid_from: "2020-01-01",
    valid_to: null,
    inherits_from: "test-base",
    source: "unit test",
    rules,
  });

// Shaped like a shifted-hours agreement: weekday evenings/nights, and a weekend
// supplement that also covers Monday 04–06 when the shift began on Sunday.
const forskudt: RuleLayer = {
  id: "forskudt",
  primitive: "time_window_supplement",
  source: "§ forskudt",
  stacking: { mode: "highest", group: "tid" },
  params: {
    windows: [
      { days: ["mon", "tue", "wed", "thu", "fri"], from: "17:00", to: "24:00" },
      { days: ["tue", "wed", "thu", "fri", "sat"], from: "00:00", to: "06:00" },
      { days: ["mon"], from: "04:00", to: "06:00", started_after: "00:00" },
    ],
    amount: { type: "ore_per_hour", ore: 1000 },
    pay_code: "FORSKUDT",
  },
};
const weekend: RuleLayer = {
  id: "weekend",
  primitive: "time_window_supplement",
  source: "§ weekend",
  stacking: { mode: "highest", group: "tid" },
  params: {
    windows: [
      { days: ["sat"], from: "17:00", to: "24:00" },
      { days: ["sun", "holiday"], from: "00:00", to: "24:00" },
      { days: ["mon"], from: "00:00", to: "04:00" },
      { days: ["mon"], from: "04:00", to: "06:00", started_at_or_before: "00:00" },
    ],
    exclude_holidays: false,
    amount: { type: "ore_per_hour", ore: 2000 },
    pay_code: "WEEKEND",
  },
};

function pay(
  rules: RuleLayer[],
  worked: ReturnType<typeof shift>[],
  from = "2026-01-01",
  to = "2026-01-31",
) {
  return calculatePay({
    ...makeInput({ extraDocs: [doc(rules)], agreementId: "supp-test" }),
    period: { from, to },
    worked,
  });
}
const hours = (r: ReturnType<typeof pay>) =>
  Object.fromEntries(r.lines.map((l) => [l.payCode, [l.quantityMinutes, l.amountOre]]));

describe("supplements without a base rate", () => {
  it("pays supplements in kr. per hour although no pay rate is configured", () => {
    const r = pay([forskudt], [shift("2026-01-06 15:00", "2026-01-06 19:00")]);
    expect(hours(r)).toEqual({ FORSKUDT: [120, 2000] });
    expect(r.notes.map((n) => n.code)).toContain("NO_PAY_RATE");
  });

  it("skips a supplement in % of the base rate, which cannot be calculated", () => {
    const pct: RuleLayer = {
      ...forskudt,
      id: "pct",
      params: {
        ...(forskudt.params as object),
        amount: { type: "percent_of_base", bp: 5000 },
        pay_code: "PCT",
      },
    };
    expect(hours(pay([pct], [shift("2026-01-06 15:00", "2026-01-06 19:00")]))).toEqual({});
  });
});

describe("windows conditional on when the shift started", () => {
  // Monday 2026-01-12; Sunday 2026-01-11.
  it("a shift begun on Sunday gets the weekend supplement Monday 04–06", () => {
    expect(
      hours(pay([forskudt, weekend], [shift("2026-01-11 22:00", "2026-01-12 06:00")])),
    ).toEqual({
      WEEKEND: [480, 16000],
    });
  });

  it("a shift begun at 00:00 Monday counts as begun no later than 00:00", () => {
    expect(
      hours(pay([forskudt, weekend], [shift("2026-01-12 00:00", "2026-01-12 08:00")])),
    ).toEqual({
      WEEKEND: [360, 12000],
    });
  });

  it("a shift begun after 00:00 Monday gets the shifted-hours supplement 04–06", () => {
    expect(
      hours(pay([forskudt, weekend], [shift("2026-01-12 04:00", "2026-01-12 12:00")])),
    ).toEqual({
      FORSKUDT: [120, 2000],
    });
  });

  it("Friday night into Saturday is shifted hours on both sides of midnight", () => {
    expect(
      hours(pay([forskudt, weekend], [shift("2026-01-09 17:00", "2026-01-10 03:00")])),
    ).toEqual({
      FORSKUDT: [600, 10000],
    });
  });

  it("works across the spring DST change (Sunday 29 March 2026 has 23 hours)", () => {
    // Sat 22:00 → Sun 06:00 is 7 real hours: 2 on Saturday, 5 on Sunday.
    expect(
      hours(
        pay(
          [forskudt, weekend],
          [shift("2026-03-28 22:00", "2026-03-29 06:00")],
          "2026-03-01",
          "2026-03-31",
        ),
      ),
    ).toEqual({
      WEEKEND: [420, 14000],
    });
  });
});

describe("rounding of supplement time per shift", () => {
  const rounded = (mode: "started" | "completed" | "nearest"): RuleLayer => ({
    ...forskudt,
    params: { ...(forskudt.params as object), rounding: { unit_minutes: 30, mode } },
  });

  it("completed half hours: 1 h 50 min → 1 h 30 min; started: → 2 h; nearest: → 2 h", () => {
    const s = [shift("2026-01-06 16:00", "2026-01-06 18:50")];
    expect(hours(pay([rounded("completed")], s))).toEqual({ FORSKUDT: [90, 1500] });
    expect(hours(pay([rounded("started")], s))).toEqual({ FORSKUDT: [120, 2000] });
    expect(hours(pay([rounded("nearest")], s))).toEqual({ FORSKUDT: [120, 2000] });
  });

  it("rounds each shift on its own", () => {
    const s = [
      shift("2026-01-06 16:00", "2026-01-06 17:20"),
      shift("2026-01-07 16:00", "2026-01-07 17:20"),
    ];
    expect(hours(pay([rounded("completed")], s))).toEqual({ FORSKUDT: [0, 0] });
    expect(hours(pay([rounded("started")], s))).toEqual({ FORSKUDT: [60, 1000] });
  });

  it("exact half hours are unchanged", () => {
    expect(
      hours(pay([rounded("started")], [shift("2026-01-06 16:00", "2026-01-06 18:30")])),
    ).toEqual({
      FORSKUDT: [90, 1500],
    });
  });
});

describe("supplements and call-out", () => {
  it("exclude_call_out leaves call-out time without the supplement; work keeps it", () => {
    const ex: RuleLayer = {
      ...forskudt,
      params: { ...(forskudt.params as object), exclude_call_out: true },
    };
    const r = pay(
      [ex],
      [
        shift("2026-01-06 18:00", "2026-01-06 19:00", { kind: "call_out" }),
        shift("2026-01-07 18:00", "2026-01-07 19:00"),
      ],
    );
    expect(hours(r)).toEqual({ FORSKUDT: [60, 1000] });
  });
});
