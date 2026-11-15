import { describe, expect, it } from "vitest";
import { finalRuleSchema } from "@vagtplan/rules-engine";
import { CONDITION_TYPES, defaultCondition, newRemarkRule, remarkId } from "./remarks";

describe("remarks", () => {
  it("makes a kebab-case id from a Danish name, unique among existing ids", () => {
    expect(remarkId("Vagt over 10 timer", [])).toBe("anm-vagt-over-10-timer");
    expect(remarkId("Sen lørdag på Åbo", [])).toBe("anm-sen-loerdag-paa-aabo");
    expect(remarkId("Vagt over 10 timer", ["anm-vagt-over-10-timer"])).toBe(
      "anm-vagt-over-10-timer-2",
    );
    expect(remarkId("!!!", [])).toBe("anm");
  });

  it("a new remark is a valid rule for every condition type", () => {
    for (const type of CONDITION_TYPES) {
      const rule = newRemarkRule("Vagt over 10 timer", [], defaultCondition(type));
      expect(rule.params.code).toBe("ANM_VAGT_OVER_10_TIMER");
      expect(finalRuleSchema("remark").safeParse(rule).success, type).toBe(true);
    }
  });
});
