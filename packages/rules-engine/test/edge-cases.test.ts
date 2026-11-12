import { describe, expect, it } from "vitest";
import { parseAgreementDocument } from "../src/agreement/schema";
import { resolveAgreement } from "../src/agreement/resolve";
import { calculatePay } from "../src/pay";
import { validateSchedule } from "../src/validate";
import { formatMinutes } from "../src/format";
import { parseHhmm, wallTime, diffDays } from "../src/time/local-time";
import { makeInput, shift, testBase } from "./support";

describe("edge cases – validation", () => {
  it("rolling 7-day weekly rest", () => {
    const input = makeInput({
      contract: {
        overrides: { rules: [{ id: "hviletid", params: { weekly_period: "rolling_7_days" } }] },
      },
    });
    const days = Array.from({ length: 8 }, (_, i) => {
      const d = `2026-01-${String(5 + i).padStart(2, "0")}`;
      return shift(`${d} 08:00`, `${d} 14:00`);
    });
    const r = validateSchedule({ ...input, intervals: days, from: "2026-01-05", to: "2026-01-12" });
    expect(r.violations.some((v) => v.code === "REST_WEEKLY")).toBe(true);
  });

  it("days without a contract are not validated", () => {
    const input = makeInput({ contract: { validFrom: "2027-01-01" } });
    const r = validateSchedule({
      ...input,
      intervals: [shift("2026-01-05 06:00", "2026-01-05 22:00")],
      from: "2026-01-05",
      to: "2026-01-05",
    });
    expect(r.violations).toEqual([]);
  });

  it("rejects inverted and too long ranges", () => {
    const input = makeInput();
    expect(() =>
      validateSchedule({ ...input, intervals: [], from: "2026-01-05", to: "2026-01-04" }),
    ).toThrow();
    expect(() =>
      validateSchedule({ ...input, intervals: [], from: "2026-01-01", to: "2027-12-31" }),
    ).toThrow();
  });
});

describe("edge cases – pay", () => {
  it("reports work without contract, missing pay rate and unknown absence types", () => {
    const input = makeInput({ contract: { validFrom: "2026-01-06" } });
    const r = calculatePay({
      ...input,
      worked: [
        shift("2026-01-05 08:00", "2026-01-05 10:00"),
        shift("2026-01-06 08:00", "2026-01-06 10:00"),
      ],
      absences: [{ id: "a", type: "ukendt", from: "2026-01-07", to: "2026-01-07" }],
      period: { from: "2026-01-05", to: "2026-01-07" },
    });
    expect(r.notes.map((n) => n.code).sort()).toEqual([
      "NO_CONTRACT",
      "NO_PAY_RATE",
      "UNKNOWN_ABSENCE_TYPE",
    ]);
    expect(r.lines).toEqual([]);
  });
});

describe("edge cases – resolution and schema", () => {
  it("detects inheritance cycles, unknown agreements and orphan overrides", () => {
    const a = parseAgreementDocument({
      ...testBase,
      id: "cyc-a",
      kind: "agreement",
      inherits_from: "cyc-b",
      rules: [],
    });
    const b = parseAgreementDocument({
      ...testBase,
      id: "cyc-b",
      kind: "agreement",
      inherits_from: "cyc-a",
      rules: [],
    });
    expect(() =>
      resolveAgreement(
        { "cyc-a": [a], "cyc-b": [b] },
        { agreementId: "cyc-a", date: "2026-01-01" },
      ),
    ).toThrow(/cycle/);
    expect(() => resolveAgreement({}, { agreementId: "nope", date: "2026-01-01" })).toThrow(
      /Unknown/,
    );
    expect(() =>
      resolveAgreement(
        { "test-base": [testBase] },
        {
          agreementId: "test-base",
          contractOverrides: { rules: [{ id: "findes-ikke", params: {} }] },
          date: "2026-01-01",
        },
      ),
    ).toThrow(/overrides nothing/);
  });

  it("validates document dates and tier structure", () => {
    expect(() =>
      parseAgreementDocument({ ...testBase, valid_from: "2026-01-02", valid_to: "2026-01-01" }),
    ).toThrow(/valid_to/);
    const bad = {
      id: "ot",
      primitive: "overtime",
      source: "x",
      params: {
        trigger: "weekly_norm",
        tiers: [
          { up_to_minutes: null, amount: { type: "percent_of_base", bp: 5000 }, pay_code: "A" },
          { up_to_minutes: null, amount: { type: "percent_of_base", bp: 5000 }, pay_code: "B" },
        ],
      },
    };
    const doc = parseAgreementDocument({ ...testBase, rules: [...testBase.rules, bad] });
    expect(() =>
      resolveAgreement({ "test-base": [doc] }, { agreementId: "test-base", date: "2026-01-01" }),
    ).toThrow(/open-ended/);
  });
});

describe("edge cases – helpers", () => {
  it("formats durations", () => {
    expect(formatMinutes(45)).toBe("45 min");
    expect(formatMinutes(-90)).toBe("-1 t 30 min");
    expect(formatMinutes(120)).toBe("2 t");
  });
  it("rejects invalid clock times and computes day differences", () => {
    expect(() => parseHhmm("8:00")).toThrow();
    expect(() => wallTime("2026-01-01", "25:00", "Europe/Copenhagen")).toThrow();
    expect(diffDays("2026-03-01", "2026-02-01")).toBe(28);
  });
});
