import { describe, expect, it } from "vitest";
import { parseAgreementDocument, type RuleLayer } from "../agreement/schema";
import { calculatePay } from "./index";
import { makeInput, shift } from "../../test/support";
import type { WorkIntervalInput } from "../model";

/**
 * A registration whose overtime the employee chose to take as time off
 * (a deviation reason "afspadsering efter overenskomsten"): overtime from that
 * interval is booked as time off with the rule's factor; other overtime and
 * ordinary hours are unchanged.
 */
const A = { type: "ore_per_hour", ore: 5000 };
const rules: RuleLayer[] = [
  {
    id: "sats",
    primitive: "pay_rate",
    source: "x",
    params: { pay_code: "NORMAL", rates: [{ hourly_ore: 15000 }] },
  },
  {
    id: "ot",
    primitive: "overtime",
    source: "x",
    params: {
      trigger: "outside_planned",
      tiers: [{ up_to_minutes: null, amount: A, pay_code: "OT" }],
      time_off_factor_bp: 15000,
      time_off_pay_code: "AFSP",
    },
  },
];
const doc = parseAgreementDocument({
  id: "ot-to",
  name: "OT",
  kind: "agreement",
  version: 1,
  valid_from: "2020-01-01",
  valid_to: null,
  inherits_from: "test-base",
  source: "x",
  rules,
});
const run = (worked: WorkIntervalInput[], planned: WorkIntervalInput[]) =>
  calculatePay({
    ...makeInput({ extraDocs: [doc], agreementId: "ot-to" }),
    worked,
    planned,
    period: { from: "2026-03-02", to: "2026-03-02" },
  });
const totals = (r: ReturnType<typeof calculatePay>) => {
  const out: Record<string, number> = {};
  for (const l of r.lines)
    out[`${l.payCode}:${l.unit}`] = (out[`${l.payCode}:${l.unit}`] ?? 0) + l.quantityMinutes;
  return out;
};

describe("overtime as time off for one registration", () => {
  const plan = shift("2026-03-02 08:00", "2026-03-02 16:00", { id: "p" });

  it("without the flag, overtime outside the plan is paid", () => {
    const r = run(
      [
        shift("2026-03-02 08:00", "2026-03-02 16:00", { plannedShiftId: "p" }),
        shift("2026-03-02 16:00", "2026-03-02 17:00"),
      ],
      [plan],
    );
    expect(totals(r)).toMatchObject({ "OT:hours": 60 });
    expect(totals(r)["AFSP:time_off_minutes"]).toBeUndefined();
  });

  it("with the flag, the same hour becomes 90 minutes of time off (factor 1,5) and no overtime pay", () => {
    const r = run(
      [
        shift("2026-03-02 08:00", "2026-03-02 16:00", { plannedShiftId: "p" }),
        { ...shift("2026-03-02 16:00", "2026-03-02 17:00"), overtimeAsTimeOff: true },
      ],
      [plan],
    );
    expect(totals(r)["OT:hours"]).toBeUndefined();
    expect(totals(r)["AFSP:time_off_minutes"]).toBe(90);
    // Ordinary hours are unchanged: 8 h planned + the extra hour at the base rate.
    expect(totals(r)["NORMAL:hours"]).toBe(540);
  });
});
