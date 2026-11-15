import { describe, expect, it } from "vitest";
import { parseAgreementDocument, type RuleLayer } from "./agreement/schema";
import { resolveAgreement } from "./agreement/resolve";
import { EngineContext } from "./context";
import { makeInput } from "../test/support";

const doc = (rules: RuleLayer[]) =>
  parseAgreementDocument({
    id: "spec-test",
    name: "Specificitet",
    kind: "agreement",
    version: 1,
    valid_from: "2020-01-01",
    valid_to: null,
    inherits_from: "test-base",
    source: "x",
    rules,
  });

const lagerBreak: RuleLayer = {
  id: "pause-lager",
  primitive: "break",
  source: "§ lager",
  applies_to: { staff_groups: ["lager"] },
  params: { after_minutes: 300, min_minutes: 30, paid: true },
};
const lagerHourlyBreak: RuleLayer = {
  id: "pause-lager-timeloen",
  primitive: "break",
  source: "§ lager timeløn",
  applies_to: { staff_groups: ["lager"], pay_forms: ["hourly"] },
  params: { after_minutes: 240, min_minutes: 15, paid: false },
};

function ctx(
  rules: RuleLayer[],
  contract: { staffGroup?: string | null; payForm?: "hourly" | "monthly" },
) {
  return new EngineContext(
    makeInput({ extraDocs: [doc(rules)], agreementId: "spec-test", contract }),
  );
}

describe("the most specific applicable rule wins", () => {
  it("a staff-group rule beats the general rule, which still applies to everyone else", () => {
    expect(ctx([lagerBreak], { staffGroup: "lager" }).rule("2026-01-05", "break")?.id).toBe(
      "pause-lager",
    );
    expect(ctx([lagerBreak], { staffGroup: "butik" }).rule("2026-01-05", "break")?.id).toBe(
      "pause",
    );
    expect(ctx([lagerBreak], { staffGroup: null }).rule("2026-01-05", "break")?.id).toBe("pause");
  });

  it("staff group + pay form beats staff group alone, whatever the order in the document", () => {
    for (const rules of [
      [lagerBreak, lagerHourlyBreak],
      [lagerHourlyBreak, lagerBreak],
    ]) {
      expect(
        ctx(rules, { staffGroup: "lager", payForm: "hourly" }).rule("2026-01-05", "break")?.id,
      ).toBe("pause-lager-timeloen");
      expect(
        ctx(rules, { staffGroup: "lager", payForm: "monthly" }).rule("2026-01-05", "break")?.id,
      ).toBe("pause-lager");
    }
  });

  it("rules() lists the most specific first and keeps document order among equals", () => {
    const ids = ctx([lagerBreak, lagerHourlyBreak], { staffGroup: "lager", payForm: "hourly" })
      .rules("2026-01-05", "break")
      .map((r) => r.id);
    expect(ids).toEqual(["pause-lager-timeloen", "pause-lager", "pause"]);
  });
});

describe("law minimum applies to every rule of a primitive", () => {
  it("a new staff-group rest rule below the law is warned about, one at the law is not", () => {
    const resolve = (daily: number) =>
      resolveAgreement(
        {
          "test-base": makeInput().registry["test-base"]!,
          "spec-test": [
            doc([
              {
                id: "hviletid-lager",
                primitive: "rest",
                source: "§ lager",
                applies_to: { staff_groups: ["lager"] },
                params: {
                  daily_minutes: daily,
                  weekly_minutes: 1440,
                  weekly_period: "calendar_week",
                },
              },
            ]),
          ],
        },
        {
          agreementId: "spec-test",
          localAgreementId: null,
          contractOverrides: null,
          date: "2026-01-05",
        },
      ).warnings.filter((w) => w.code === "BELOW_LAW_MINIMUM");
    expect(resolve(600)).toMatchObject([
      { ruleId: "hviletid-lager", path: "params.daily_minutes", base: 660, value: 600 },
    ]);
    expect(resolve(660)).toEqual([]);
  });
});
