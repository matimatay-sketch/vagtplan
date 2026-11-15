import { describe, expect, it } from "vitest";
import { PRIMITIVES, finalRuleSchema } from "@vagtplan/rules-engine";
import { RULE_TYPES, newRule, payCodeFrom, payCodesUsed } from "./rule-templates";

describe("rule templates", () => {
  it("offers every primitive the engine knows, each with a Danish label", () => {
    expect(RULE_TYPES.map((t) => t.primitive).sort()).toEqual([...PRIMITIVES].sort());
    for (const t of RULE_TYPES) expect(t.label.length).toBeGreaterThan(2);
  });

  it("a new rule of every type is valid, has a source to fill in and no invented amounts", () => {
    for (const { primitive } of RULE_TYPES) {
      const rule = newRule(primitive, "Aftentillæg lager", []);
      const parsed = finalRuleSchema(primitive).safeParse(rule);
      expect(parsed.success, `${primitive}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
      expect(rule.todo_jura).toMatch(/Udfyld/);
      expect(JSON.stringify(rule.params)).not.toMatch(/"(ore|hourly_ore|bp)":[1-9]/);
    }
  });

  it("ids are unique kebab-case and pay codes come from the name", () => {
    expect(newRule("time_window_supplement", "Aftentillæg lager", []).id).toBe(
      "aftentillaeg-lager",
    );
    expect(newRule("time_window_supplement", "Aftentillæg lager", ["aftentillaeg-lager"]).id).toBe(
      "aftentillaeg-lager-2",
    );
    expect(newRule("time_window_supplement", "Aftentillæg lager", []).params).toMatchObject({
      pay_code: "AFTENTILLAEG_LAGER",
    });
    expect(payCodeFrom("Søndag/helligdag 100 %")).toBe("SOENDAG_HELLIGDAG_100");
    expect(payCodeFrom("!!")).toBe("LOENART");
  });

  it("lists the pay codes the rules use", () => {
    expect(
      payCodesUsed([
        { primitive: "pay_rate", params: { pay_code: "NORMAL", rates: [] } },
        {
          primitive: "overtime",
          params: { tiers: [{ pay_code: "OT50" }, { pay_code: "OT100" }] },
        },
        { primitive: "on_call", params: { pay_code: "RAAD", call_out_guarantee_pay_code: "TILK" } },
        { primitive: "absence", params: { types: [{ pay_code: "SYG" }, { pay_code: null }] } },
        { primitive: "rest", params: {} },
      ]),
    ).toEqual(["NORMAL", "OT100", "OT50", "RAAD", "SYG", "TILK"]);
  });
});
