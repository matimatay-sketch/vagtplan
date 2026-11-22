import { describe, expect, it } from "vitest";
import { customRulesSchema, newCustomRule } from "./custom-rules";

const rule = (over: Record<string, unknown> = {}) => ({
  id: "egen-lange-vagter",
  label: "Lange vagter",
  severity: "WARNING",
  params: {
    code: "EGEN_LANGE_VAGTER",
    message: "Vagten er over 10 timer",
    show_in: ["schedule", "time"],
    condition: { type: "shift_longer_than", minutes: 600 },
  },
  ...over,
});

describe("customRulesSchema", () => {
  it("accepts remark rules with a name and a severity", () => {
    expect(customRulesSchema.safeParse([rule()]).success).toBe(true);
    expect(customRulesSchema.safeParse([]).success).toBe(true);
  });

  it("checks the remark itself with the rules engine", () => {
    const r = customRulesSchema.safeParse([
      rule({ params: { ...rule().params, code: "lille", message: "" } }),
    ]);
    expect(r.success).toBe(false);
  });

  it("needs a name, unique ids and unique codes", () => {
    expect(customRulesSchema.safeParse([rule({ label: " " })]).success).toBe(false);
    const twice = customRulesSchema.safeParse([rule(), rule({ id: "egen-andet" })]);
    expect(twice.success).toBe(false);
    expect(twice.error!.issues[0]!.message).toBe("Koden EGEN_LANGE_VAGTER er brugt to gange");
  });
});

describe("newCustomRule", () => {
  it("makes an id and a code from the name that do not clash", () => {
    const first = newCustomRule("Lange vagter", "shift_longer_than", []);
    expect(first.id).toBe("egen-lange-vagter");
    expect(first.params.code).toBe("EGEN_LANGE_VAGTER");
    expect(first.severity).toBe("WARNING");
    expect(first.params.condition).toEqual({ type: "shift_longer_than", minutes: 0 });
    const second = newCustomRule("Lange vagter", "weekly_hours", [first]);
    expect(second.id).toBe("egen-lange-vagter-2");
    expect(second.params.code).toBe("EGEN_LANGE_VAGTER_2");
  });
});
