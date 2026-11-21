import { describe, expect, it } from "vitest";
import { parseAgreementDocument, type RuleLayer } from "../agreement/schema";
import { leaveAccruals } from "./ledger";
import { calculatePay } from "../pay/index";
import { makeInput } from "../../test/support";

/**
 * Seniority requirements (as in Industriens Overenskomst: feriefridage and
 * børneomsorgsdage after 9 months, sick pay after 6 months).
 */
const doc = (rules: RuleLayer[]) =>
  parseAgreementDocument({
    id: "anc",
    name: "Anciennitet",
    kind: "agreement",
    version: 1,
    valid_from: "2020-01-01",
    valid_to: null,
    inherits_from: "test-base",
    source: "x",
    rules,
  });

const vacation = (extra: Record<string, unknown>): RuleLayer => ({
  id: "ferie",
  primitive: "vacation",
  source: "x",
  params: {
    days_per_month: 2.08,
    holiday_year_start: "09-01",
    usage_extends_months: 4,
    main_holiday: { min_consecutive_days: 15, from: "05-01", to: "09-30" },
    vacation_pay_bp: null,
    vacation_supplement_bp: null,
    special_vacation_pay_bp: null,
    extra_days: { days_per_year: 5, year_start: "09-01", accrual: "upfront", ...extra },
  },
});

const absence: RuleLayer = {
  id: "fravaer",
  primitive: "absence",
  source: "x",
  params: {
    types: [
      {
        code: "sick",
        label: "Sygdom",
        payment: "full",
        pay_code: "SYG",
        counts_towards_norm: true,
        paid_from_seniority_months: 6,
      },
      {
        code: "child_care_day",
        label: "Børneomsorgsdag",
        payment: "none",
        pay_code: null,
        counts_towards_norm: true,
        entitlement: {
          days: 2,
          period: "holiday_year",
          accrual: "upfront",
          min_seniority_months: 9,
        },
      },
    ],
  },
};

const input = (rules: RuleLayer[], validFrom: string, seniorityDate: string | null = null) =>
  makeInput({
    extraDocs: [doc(rules)],
    agreementId: "anc",
    contract: { validFrom, seniorityDate },
  });

describe("seniority requirements", () => {
  it("feriefridage only from 9 months: reached 31 August still gives the year ending that day", () => {
    // Hired 1 December 2025: 9 months on 1 September 2026, the start of the next year.
    const late = leaveAccruals(
      input([vacation({ min_seniority_months: 9 })], "2025-12-01"),
      "2027-09-30",
    ).filter((p) => p.account === "extra");
    expect(late.map((p) => [p.date, p.hundredths, p.periodStart])).toEqual([
      ["2026-09-01", 500, "2026-09-01"],
      ["2027-09-01", 500, "2027-09-01"],
    ]);
    // Hired 30 November 2025: 9 months on 30 August 2026, within the year ending 31 August.
    const early = leaveAccruals(
      input([vacation({ min_seniority_months: 9 })], "2025-11-30"),
      "2026-09-30",
    ).filter((p) => p.account === "extra");
    expect(early.map((p) => [p.date, p.periodStart])).toEqual([
      ["2026-08-30", "2025-09-01"],
      ["2026-09-01", "2026-09-01"],
    ]);
  });

  it("the seniority date on the contract counts (earlier employment)", () => {
    const r = leaveAccruals(
      input([vacation({ min_seniority_months: 9 })], "2026-03-01", "2024-01-01"),
      "2026-03-31",
    ).filter((p) => p.account === "extra");
    expect(r.map((p) => [p.date, p.periodStart])).toEqual([["2026-03-01", "2025-09-01"]]);
  });

  it("absence entitlements wait for the seniority", () => {
    const r = leaveAccruals(input([absence], "2026-01-01"), "2026-12-31").filter(
      (p) => p.account === "child_care_day",
    );
    // 9 months on 1 October 2026, in the holiday year from 1 September 2026.
    expect(r.map((p) => [p.date, p.hundredths, p.periodStart])).toEqual([
      ["2026-10-01", 200, "2026-09-01"],
    ]);
  });

  it("sick pay only from 6 months; before that a note", () => {
    const run = (date: string) =>
      calculatePay({
        ...input(
          [
            {
              id: "sats",
              primitive: "pay_rate",
              source: "x",
              params: { pay_code: "NORMAL", rates: [{ hourly_ore: 15000 }] },
            },
            absence,
          ],
          "2026-01-05",
        ),
        worked: [],
        absences: [{ id: "a", type: "sick", from: date, to: date }],
        period: { from: date, to: date },
      });
    // 6 months on 5 July 2026. 1 July is a Wednesday, 7 July a Tuesday.
    const before = run("2026-07-01");
    expect(before.lines).toEqual([]);
    expect(before.notes.map((n) => n.code)).toContain("ABSENCE_UNPAID_SENIORITY");
    const after = run("2026-07-07");
    expect(after.lines.map((l) => [l.payCode, l.quantityMinutes])).toEqual([["SYG", 444]]);
  });
});
