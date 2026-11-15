import { describe, expect, it } from "vitest";
import { parseAgreementDocument, type RuleLayer } from "../agreement/schema";
import { calculatePay } from "./index";
import { makeInput, shift } from "../../test/support";

/** On-call (rådighed) without a base rate. All amounts are test values. */
const doc = (rules: RuleLayer[]) =>
  parseAgreementDocument({
    id: "oncall-test",
    name: "Rådighed",
    kind: "agreement",
    version: 1,
    valid_from: "2020-01-01",
    valid_to: null,
    inherits_from: "test-base",
    source: "unit test",
    rules,
  });

const base = {
  amount: { type: "ore_per_hour", ore: 1000 },
  pay_code: "RAAD",
  call_out_min_minutes: 0,
  call_out_guarantee_pay_code: "GARANTI",
};
const onCall = (params: Record<string, unknown>): RuleLayer => ({
  id: "raadighed",
  primitive: "on_call",
  source: "§ rådighed",
  params: { ...base, ...params },
});
const weekendRate = {
  rate_windows: [
    {
      days: ["sat", "sun", "holiday"],
      from: "00:00",
      to: "24:00",
      amount: { type: "ore_per_hour", ore: 1500 },
      pay_code: "RAAD_WE",
    },
  ],
};

const oc = (from: string, to: string, id?: string) =>
  shift(from, to, { kind: "on_call", ...(id ? { id } : {}) });
const co = (from: string, to: string) => shift(from, to, { kind: "call_out" });

function pay(
  rule: RuleLayer,
  worked: ReturnType<typeof shift>[],
  from = "2026-01-01",
  to = "2026-01-31",
) {
  return calculatePay({
    ...makeInput({ extraDocs: [doc([rule])], agreementId: "oncall-test" }),
    period: { from, to },
    worked,
  });
}
const lines = (r: ReturnType<typeof pay>) =>
  Object.fromEntries(r.lines.map((l) => [l.payCode, [l.quantityMinutes, l.amountOre]]));

describe("on-call rate by day type", () => {
  it("a weekday on-call is paid at the default rate, also without a base rate", () => {
    expect(lines(pay(onCall(weekendRate), [oc("2026-01-06 16:00", "2026-01-07 07:00")]))).toEqual({
      RAAD: [900, 15000],
    });
  });

  it("Friday evening to Saturday morning is split at midnight between the two rates", () => {
    expect(lines(pay(onCall(weekendRate), [oc("2026-01-09 16:00", "2026-01-10 08:00")]))).toEqual({
      RAAD: [480, 8000],
      RAAD_WE: [480, 12000],
    });
  });

  it("a public holiday on a weekday is paid at the holiday rate", () => {
    // 2026-04-03 is Good Friday (langfredag).
    expect(
      lines(
        pay(
          onCall(weekendRate),
          [oc("2026-04-03 08:00", "2026-04-03 12:00")],
          "2026-04-01",
          "2026-04-30",
        ),
      ),
    ).toEqual({ RAAD_WE: [240, 6000] });
  });
});

describe("rounding of on-call time", () => {
  it("per begun half hour: 40 minutes are paid as 60", () => {
    expect(
      lines(
        pay(onCall({ rounding: { unit_minutes: 30, mode: "started" } }), [
          oc("2026-01-06 16:00", "2026-01-06 16:40"),
        ]),
      ),
    ).toEqual({ RAAD: [60, 1000] });
  });
});

describe("call-out during on-call", () => {
  const rule = onCall({
    call_out_pay: {
      amount: { type: "ore_per_hour", ore: 3000 },
      pay_code: "UDKALD",
      unit_minutes: 60,
      max_rate_ore: null,
    },
  });

  it("the call-out is paid per begun hour and is not paid as on-call", () => {
    const r = pay(rule, [
      oc("2026-01-06 16:00", "2026-01-07 00:00"),
      co("2026-01-06 18:00", "2026-01-06 18:20"),
    ]);
    // 8 h on-call minus 20 min call-out = 460 min; call-out 20 min → 1 begun hour.
    expect(lines(r)).toEqual({ RAAD: [460, 7667], UDKALD: [60, 3000] });
  });

  it("a rate above the cap is capped", () => {
    const capped = onCall({
      call_out_pay: {
        amount: { type: "ore_per_hour", ore: 3000 },
        pay_code: "UDKALD",
        unit_minutes: 60,
        max_rate_ore: 2500,
      },
    });
    const r = pay(capped, [
      oc("2026-01-06 16:00", "2026-01-07 00:00"),
      co("2026-01-06 18:00", "2026-01-06 19:30"),
    ]);
    expect(lines(r).UDKALD).toEqual([120, 5000]);
  });

  it("a call-out in % of the base rate cannot be paid without a base rate and is noted", () => {
    const pct = onCall({
      call_out_pay: {
        amount: { type: "percent_of_base", bp: 20000 },
        pay_code: "UDKALD",
        unit_minutes: 60,
        max_rate_ore: null,
      },
    });
    const r = pay(pct, [
      oc("2026-01-06 16:00", "2026-01-07 00:00"),
      co("2026-01-06 18:00", "2026-01-06 18:20"),
    ]);
    expect(lines(r).UDKALD).toBeUndefined();
    expect(r.notes.map((n) => n.code)).toContain("NO_PAY_RATE");
  });
});

describe("monthly tiers of on-call hours", () => {
  const tiers = {
    monthly_tiers: [
      { from_minutes: 8400, to_minutes: 12600, percent_bp: 5000, pay_code: "RAAD_50" },
      { from_minutes: 12600, to_minutes: null, percent_bp: 10000, pay_code: "RAAD_100" },
    ],
  };
  // Ten weekday-to-weekday on-calls of 15 h: 16:00 → 07:00, 5–14 January (incl. a weekend).
  const ten = Array.from({ length: 10 }, (_, k) => {
    const d = String(5 + k).padStart(2, "0");
    const n = String(6 + k).padStart(2, "0");
    return oc(`2026-01-${d} 16:00`, `2026-01-${n} 07:00`, `oc${k}`);
  });

  it("hours 141–210 in a month get 50 % of the on-call rate on top", () => {
    // 150 h → the last 10 h (600 min) are above 140 h.
    expect(lines(pay(onCall(tiers), ten)).RAAD_50).toEqual([600, 5000]);
  });

  it("counts from the start of the month, also before the pay period", () => {
    expect(lines(pay(onCall(tiers), ten, "2026-01-14", "2026-01-31")).RAAD_50).toEqual([600, 5000]);
  });

  it("does not count the previous month", () => {
    const dec = oc("2025-12-01 00:00", "2025-12-07 00:00", "dec");
    expect(lines(pay(onCall(tiers), [dec, ...ten])).RAAD_50).toEqual([600, 5000]);
  });

  it("call-out hours count towards the limit but get no extra", () => {
    const nine = ten.slice(0, 9);
    // In the 9th on-call, a 2-hour call-out: 780 min on-call + 120 min call-out still count 900.
    const r = pay(onCall(tiers), [...nine, co("2026-01-13 20:00", "2026-01-13 22:00"), ten[9]!]);
    expect(lines(r).RAAD_50).toEqual([600, 5000]);
  });

  it("above 210 h the second tier applies, at the rate of each minute's window", () => {
    // 15 on-calls of 15 h = 225 h: 70 h in tier 1, 15 h in tier 2.
    const fifteen = Array.from({ length: 15 }, (_, k) => {
      const d = String(5 + k).padStart(2, "0");
      const n = String(6 + k).padStart(2, "0");
      return oc(`2026-01-${d} 16:00`, `2026-01-${n} 07:00`, `f${k}`);
    });
    const r = lines(pay(onCall(tiers), fifteen));
    expect(r.RAAD_50).toEqual([4200, 35000]);
    expect(r.RAAD_100).toEqual([900, 15000]);
  });
});
