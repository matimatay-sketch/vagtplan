import { describe, expect, it } from "vitest";
import { deviationReasonSchema, deviationThresholdSchema } from "./deviation-reasons";

const form = (entries: [string, string][]) => {
  const fd = new FormData();
  for (const [k, v] of entries) fd.append(k, v);
  return fd;
};

describe("deviationReasonSchema", () => {
  it("time off by a factor: the factor is typed as hours per hour (1,5)", () => {
    expect(
      deviationReasonSchema.parse(
        form([
          ["name", " Afspadsering "],
          ["applies_to", "late_out"],
          ["applies_to", "unplanned"],
          ["treatment", "time_off"],
          ["time_off_mode", "factor"],
          ["time_off_factor", "1,5"],
          ["time_off_pay_code", "afsp"],
        ]),
      ),
    ).toEqual({
      name: "Afspadsering",
      applies_to: ["late_out", "unplanned"],
      treatment: "time_off",
      time_off_mode: "factor",
      time_off_factor_bp: 15000,
      time_off_pay_code: "AFSP",
      absence_type: null,
    });
  });

  it("absence needs a type; time off by a factor needs a pay code; a situation is required", () => {
    const r = deviationReasonSchema.safeParse(
      form([
        ["name", "Lægebesøg"],
        ["treatment", "absence"],
      ]),
    );
    expect(r.error!.issues.map((i) => i.path.join("."))).toEqual(
      expect.arrayContaining(["applies_to", "absence_type"]),
    );
    const f = deviationReasonSchema.safeParse(
      form([
        ["name", "Afsp"],
        ["applies_to", "late_out"],
        ["treatment", "time_off"],
        ["time_off_mode", "factor"],
        ["time_off_factor", "1"],
      ]),
    );
    expect(f.error!.issues.map((i) => i.path.join("."))).toEqual(["time_off_pay_code"]);
  });

  it("fields that do not belong to the treatment are cleared", () => {
    expect(
      deviationReasonSchema.parse(
        form([
          ["name", "Trafik"],
          ["applies_to", "late_in"],
          ["treatment", "none"],
          ["absence_type", "sick"],
          ["time_off_pay_code", "AFSP"],
        ]),
      ),
    ).toMatchObject({ absence_type: null, time_off_pay_code: null, time_off_mode: "agreement" });
  });
});

describe("deviationThresholdSchema", () => {
  it("whole minutes 0–240", () => {
    expect(deviationThresholdSchema.parse({ deviation_threshold_minutes: "5" })).toEqual({
      deviation_threshold_minutes: 5,
    });
    expect(deviationThresholdSchema.safeParse({ deviation_threshold_minutes: "300" }).success).toBe(
      false,
    );
  });
});
