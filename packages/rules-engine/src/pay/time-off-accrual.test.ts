import { describe, expect, it } from "vitest";
import { parseAgreementDocument, type RuleLayer } from "../agreement/schema";
import { calculatePay } from "./index";
import { makeInput, shift } from "../../test/support";

/** Time off earned as pay lines (unit time_off_minutes, amount 0). Test values. */
const doc = (rules: RuleLayer[]) =>
  parseAgreementDocument({
    id: "accrual-test",
    name: "Frihed",
    kind: "agreement",
    version: 1,
    valid_from: "2020-01-01",
    valid_to: null,
    inherits_from: "test-base",
    source: "unit test",
    rules,
  });

// 3 h off per 37 h worked on 2nd and 3rd shift (15–23 and 23–07), every day.
const shifts: RuleLayer = {
  id: "frihed-skift",
  primitive: "time_off_accrual",
  source: "§ frihed",
  params: {
    pay_code: "FRIHED_SKIFT",
    basis: {
      type: "worked_in_windows",
      windows: [{ days: ["any"], from: "15:00", to: "07:00" }],
      exclude_holidays: false,
      per_minutes: 2220,
      earn_minutes: 180,
    },
  },
};
const holiday: RuleLayer = {
  id: "erstatningsfrihed",
  primitive: "time_off_accrual",
  source: "§ helligdag",
  params: { pay_code: "ERSTATNINGSFRI", basis: { type: "holiday_work", earn_minutes: 444 } },
};

function pay(
  rules: RuleLayer[],
  worked: ReturnType<typeof shift>[],
  from = "2026-01-01",
  to = "2026-04-30",
) {
  return calculatePay({
    ...makeInput({ extraDocs: [doc(rules)], agreementId: "accrual-test" }),
    period: { from, to },
    worked,
  });
}
const lines = (r: ReturnType<typeof pay>) =>
  Object.fromEntries(r.lines.map((l) => [l.payCode, [l.unit, l.quantityMinutes, l.amountOre]]));

describe("time off per hours worked in windows", () => {
  it("37 hours on 2nd/3rd shift earn exactly 3 hours", () => {
    // 4 × 8 h + 5 h = 37 h, all 15:00 or later.
    const worked = [
      ...["05", "06", "07", "08"].map((d) => shift(`2026-01-${d} 15:00`, `2026-01-${d} 23:00`)),
      shift("2026-01-09 15:00", "2026-01-09 20:00"),
    ];
    expect(lines(pay([shifts], worked))).toEqual({ FRIHED_SKIFT: ["time_off_minutes", 180, 0] });
  });

  it("only time inside the windows counts, and the share is exact (8 h → 38,9 min → 39)", () => {
    // 07:00–23:00: 8 h of it (15–23) is inside.
    expect(lines(pay([shifts], [shift("2026-01-05 07:00", "2026-01-05 23:00")]))).toEqual({
      FRIHED_SKIFT: ["time_off_minutes", 39, 0],
    });
  });

  it("night shifts across midnight count until 07:00", () => {
    expect(lines(pay([shifts], [shift("2026-01-05 23:00", "2026-01-06 08:00")]))).toEqual({
      FRIHED_SKIFT: ["time_off_minutes", Math.round((480 * 180) / 2220), 0],
    });
  });

  it("day shifts earn nothing", () => {
    expect(lines(pay([shifts], [shift("2026-01-05 07:00", "2026-01-05 15:00")]))).toEqual({});
  });
});

describe("time off for work on a public holiday", () => {
  it("work on a holiday earns the configured time off once per day", () => {
    // 2026-04-03 is Good Friday.
    const r = pay(
      [holiday],
      [
        shift("2026-04-03 06:00", "2026-04-03 10:00"),
        shift("2026-04-03 14:00", "2026-04-03 18:00"),
        shift("2026-04-07 06:00", "2026-04-07 10:00"),
      ],
    );
    expect(lines(r)).toEqual({ ERSTATNINGSFRI: ["time_off_minutes", 444, 0] });
  });

  it("two holidays earn twice", () => {
    // Good Friday and Easter Monday 2026.
    const r = pay(
      [holiday],
      [
        shift("2026-04-03 06:00", "2026-04-03 10:00"),
        shift("2026-04-06 06:00", "2026-04-06 10:00"),
      ],
    );
    expect(lines(r)).toEqual({ ERSTATNINGSFRI: ["time_off_minutes", 888, 0] });
  });
});
