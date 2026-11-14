import { describe, expect, it } from "vitest";
import { parseAgreementDocument } from "../agreement/schema";
import { leaveAccruals, leaveDays, mainHolidayStatus } from "./ledger";
import { makeInput } from "../../test/support";

const doc = parseAgreementDocument({
  id: "ferie-test",
  name: "Ferie",
  kind: "agreement",
  version: 1,
  valid_from: "2020-01-01",
  valid_to: null,
  inherits_from: "test-base",
  source: "x",
  rules: [
    {
      id: "ferie",
      primitive: "vacation",
      source: "Ferieloven",
      params: {
        days_per_month: 2.08,
        holiday_year_start: "09-01",
        usage_extends_months: 4,
        main_holiday: { min_consecutive_days: 15, from: "05-01", to: "09-30" },
        vacation_pay_bp: null,
        vacation_supplement_bp: null,
        special_vacation_pay_bp: null,
      },
    },
    {
      id: "fravaer",
      primitive: "absence",
      source: "§ 11",
      params: {
        types: [
          {
            code: "sick",
            label: "Syg",
            payment: "full",
            pay_code: "SYG",
            counts_towards_norm: true,
          },
          {
            code: "care_day",
            label: "Omsorgsdag",
            payment: "full",
            pay_code: "OMSORG",
            counts_towards_norm: true,
            entitlement: { days: 2, period: "calendar_year", accrual: "upfront" },
          },
        ],
      },
    },
  ],
});

const contract = (validFrom: string, validTo: string | null, id = "c1") => ({
  id,
  validFrom,
  validTo,
  agreementId: "ferie-test",
  localAgreementId: null,
  overrides: null,
  payForm: "hourly" as const,
  weeklyNormMinutes: 2220,
  staffGroup: null,
  payStep: null,
});

describe("leaveAccruals", () => {
  it("vacation in hundredths of a day per month, across the change of holiday year, plus entitlements", () => {
    const input = makeInput({ extraDocs: [doc], contracts: [contract("2026-08-15", null)] });
    expect(leaveAccruals(input, "2026-09-30")).toEqual(
      [
        // 17 of 31 days in August: 2.08 × 17 / 31 = 1.14 days, holiday year 2025/26.
        {
          account: "vacation",
          date: "2026-08-31",
          hundredths: 114,
          periodStart: "2025-09-01",
          usableUntil: "2026-12-31",
          note: "Optjent ferie",
        },
        // Granted when employed (TODO(jura): proration of upfront entitlements).
        {
          account: "care_day",
          date: "2026-08-15",
          hundredths: 200,
          periodStart: "2026-01-01",
          usableUntil: "2026-12-31",
          note: "Omsorgsdag",
        },
        // September belongs to the new holiday year 2026/27.
        {
          account: "vacation",
          date: "2026-09-30",
          hundredths: 208,
          periodStart: "2026-09-01",
          usableUntil: "2027-12-31",
          note: "Optjent ferie",
        },
      ].sort((a, b) => a.date.localeCompare(b.date)),
    );
  });

  it("a contract change mid-month splits the month without double grants", () => {
    const input = makeInput({
      extraDocs: [doc],
      contracts: [contract("2026-01-01", "2026-01-15", "a"), contract("2026-01-16", null, "b")],
    });
    const r = leaveAccruals(input, "2026-01-31");
    // 2.08 × 15/31 = 1.0065 → 1.01 and 2.08 × 16/31 = 1.0735 → 1.07.
    expect(r.filter((p) => p.account === "vacation").map((p) => [p.date, p.hundredths])).toEqual([
      ["2026-01-15", 101],
      ["2026-01-31", 107],
    ]);
    expect(r.filter((p) => p.account === "care_day")).toHaveLength(1);
  });

  it("stops when employment ends mid-month", () => {
    const input = makeInput({
      extraDocs: [doc],
      contracts: [contract("2026-01-01", "2026-02-10")],
    });
    // February: 2.08 × 10/28 = 0.743 → 0.74, posted on the last day of employment.
    expect(
      leaveAccruals(input, "2026-03-31")
        .filter((p) => p.account === "vacation")
        .map((p) => [p.date, p.hundredths]),
    ).toEqual([
      ["2026-01-31", 208],
      ["2026-02-10", 74],
    ]);
  });
});

describe("leaveDays", () => {
  it("counts Monday–Friday except holidays (Easter 2026)", () => {
    const input = makeInput({ extraDocs: [doc], contracts: [contract("2020-01-01", null)] });
    // 30 March – 10 April: 10 weekdays minus Maundy Thursday, Good Friday and Easter Monday.
    expect(leaveDays(input, "2026-03-30", "2026-04-10")).toEqual([
      "2026-03-30",
      "2026-03-31",
      "2026-04-01",
      "2026-04-07",
      "2026-04-08",
      "2026-04-09",
      "2026-04-10",
    ]);
    expect(leaveDays(input, "2026-04-04", "2026-04-05")).toEqual([]);
  });
});

describe("mainHolidayStatus", () => {
  const input = makeInput({ extraDocs: [doc], contracts: [contract("2020-01-01", null)] });
  const weekdays = (from: string, to: string) => leaveDays(input, from, to);

  it("15 consecutive vacation days in the summer of the holiday year are enough", () => {
    const r = mainHolidayStatus(input, "2025-09-01", weekdays("2026-07-06", "2026-07-24"));
    expect(r).toEqual({
      from: "2026-05-01",
      to: "2026-09-30",
      required: 15,
      longest: 15,
      ok: true,
    });
  });

  it("a working day in the middle breaks the run; weekends do not", () => {
    const days = weekdays("2026-07-06", "2026-07-24").filter((d) => d !== "2026-07-15");
    expect(mainHolidayStatus(input, "2025-09-01", days)).toMatchObject({ longest: 7, ok: false });
  });

  it("days outside the main holiday period do not count", () => {
    const r = mainHolidayStatus(input, "2025-09-01", weekdays("2026-04-13", "2026-05-08"));
    // Only 1–8 May are inside: Friday 1 May + 4–8 May = 6 (Ascension Day is 14 May).
    expect(r).toMatchObject({ longest: 6, ok: false });
  });
});
