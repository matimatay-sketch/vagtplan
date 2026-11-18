import { describe, expect, it } from "vitest";
import {
  DEFAULT_NORM,
  effectivePercent,
  entryPayNormPercent,
  normDefaultsFrom,
  normMinutes,
  payNormPercent,
} from "./norm-percent";

const org = normDefaultsFrom({
  norm_percent_work: 100,
  norm_percent_on_call: 33,
  norm_in_pay_work: false,
  norm_in_pay_on_call: true,
});

describe("norm percent", () => {
  it("without settings, work counts in full and on-call not at all", () => {
    expect(effectivePercent({ kind: "work" }, DEFAULT_NORM)).toBe(100);
    expect(effectivePercent({ kind: "on_call" }, DEFAULT_NORM)).toBe(0);
    expect(payNormPercent({ kind: "on_call", norm_percent: 50 }, DEFAULT_NORM)).toBeNull();
  });

  it("the shift's own value wins over the organization's default for the kind", () => {
    expect(effectivePercent({ kind: "on_call" }, org)).toBe(33);
    expect(effectivePercent({ kind: "on_call", norm_percent: 0 }, org)).toBe(0);
    expect(effectivePercent({ kind: "work", norm_percent: 50 }, org)).toBe(50);
  });

  it("is handed to the pay engine only when it is used in pay", () => {
    expect(payNormPercent({ kind: "on_call" }, org)).toBe(33);
    expect(payNormPercent({ kind: "on_call", norm_in_pay: false }, org)).toBeNull();
    expect(payNormPercent({ kind: "work", norm_percent: 50 }, org)).toBeNull();
    expect(payNormPercent({ kind: "work", norm_percent: 50, norm_in_pay: true }, org)).toBe(50);
  });

  it("rounds counted minutes: 8 hours of on-call at 33 % = 158 minutes", () => {
    // 480 × 0.33 = 158.4
    expect(normMinutes(480, 33)).toBe(158);
    expect(normMinutes(480, 100)).toBe(480);
    expect(normMinutes(480, 0)).toBe(0);
  });

  it("a registration uses its published plan of the same kind; call-out keeps the default", () => {
    const plan = { kind: "on_call" as const, norm_percent: 50, norm_in_pay: true };
    expect(entryPayNormPercent("on_call", plan, DEFAULT_NORM)).toBe(50);
    expect(entryPayNormPercent("call_out", plan, org)).toBeNull();
    // A work registration on an on-call plan uses the defaults for work.
    expect(entryPayNormPercent("work", plan, org)).toBeNull();
    // Without a plan: the organization's defaults (on-call 33 % used in pay).
    expect(entryPayNormPercent("on_call", undefined, org)).toBe(33);
  });
});
