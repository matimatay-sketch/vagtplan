import { describe, expect, it } from "vitest";
import { parseAgreementDocument } from "../agreement/schema";
import { simulateWeek } from "./index";
import { makeInput, shift } from "../../test/support";

const v1 = parseAgreementDocument({
  id: "sim",
  name: "Sim",
  kind: "agreement",
  version: 1,
  valid_from: "2020-01-01",
  valid_to: null,
  inherits_from: "test-base",
  source: "x",
  rules: [
    {
      id: "sats",
      primitive: "pay_rate",
      source: "x",
      params: { pay_code: "NORMAL", rates: [{ hourly_ore: 12000 }] },
    },
    {
      id: "aften",
      primitive: "time_window_supplement",
      source: "x",
      params: {
        windows: [{ days: ["weekday"], from: "18:00", to: "24:00" }],
        amount: { type: "ore_per_hour", ore: 2500 },
        pay_code: "AFTEN",
      },
    },
  ],
});

describe("simulateWeek", () => {
  it("compares pay lines and violations before and after a document change", () => {
    const after = {
      ...v1,
      rules: v1.rules.map((r) =>
        r.id === "aften"
          ? { ...r, params: { ...r.params, amount: { type: "ore_per_hour", ore: 4000 } } }
          : r,
      ),
    };
    const input = makeInput({ extraDocs: [v1], agreementId: "sim" });
    const r = simulateWeek({
      ...input,
      weekStart: "2026-01-05",
      worked: [shift("2026-01-05 16:00", "2026-01-05 22:00")],
      replace: parseAgreementDocument(after),
    });
    expect(r.diff).toEqual([
      { payCode: "AFTEN", beforeOre: 10000, afterOre: 16000, deltaOre: 6000 },
    ]);
    expect(r.before.totalOre).toBe(82000);
    expect(r.after.totalOre).toBe(88000);
  });

  it("reports a validation error caused by the change", () => {
    const strict = parseAgreementDocument({
      ...v1,
      rules: [
        ...v1.rules,
        {
          id: "min-vagt",
          primitive: "min_shift",
          source: "x",
          params: { min_minutes: 480, guarantee_pay: false, pay_code: "G" },
        },
      ],
    });
    const r = simulateWeek({
      ...makeInput({ extraDocs: [v1], agreementId: "sim" }),
      weekStart: "2026-01-05",
      worked: [shift("2026-01-05 16:00", "2026-01-05 22:00")],
      replace: strict,
    });
    expect(r.before.violations.map((v) => v.code)).toEqual([]);
    expect(r.after.violations.map((v) => v.code)).toEqual(["MIN_SHIFT"]);
  });
});
