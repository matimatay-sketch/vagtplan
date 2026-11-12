import { describe, expect, it } from "vitest";
import { parseAgreementDocument, type RuleLayer } from "../agreement/schema";
import { calculatePay } from "./index";
import { makeInput, shift } from "../../test/support";

const docWith = (rules: RuleLayer[]) =>
  parseAgreementDocument({
    id: "ot-test",
    name: "OT",
    kind: "agreement",
    version: 1,
    valid_from: "2020-01-01",
    valid_to: null,
    inherits_from: "test-base",
    source: "unit test",
    rules: [
      {
        id: "sats",
        primitive: "pay_rate",
        source: "x",
        params: { pay_code: "NORMAL", rates: [{ hourly_ore: 12000 }] },
      },
      ...rules,
    ],
  });

const ot = (trigger: string, extra: Record<string, unknown> = {}): RuleLayer => ({
  id: "ot",
  primitive: "overtime",
  source: "x",
  params: {
    trigger,
    tiers: [{ up_to_minutes: null, amount: { type: "percent_of_base", bp: 5000 }, pay_code: "OT" }],
    ...extra,
  },
});

const run = (
  rules: RuleLayer[],
  worked: ReturnType<typeof shift>[],
  from: string,
  to: string,
  extra = {},
) =>
  calculatePay({
    ...makeInput({ extraDocs: [docWith(rules)], agreementId: "ot-test" }),
    worked,
    period: { from, to },
    ...extra,
  });
const otMinutes = (r: ReturnType<typeof calculatePay>) =>
  r.lines.filter((l) => l.payCode === "OT").reduce((s, l) => s + l.quantityMinutes, 0);

describe("overtime triggers", () => {
  it("daily_norm: minutes beyond the daily norm each day", () => {
    const rules = [
      ot("daily_norm"),
      {
        id: "norm",
        primitive: "norm",
        source: "x",
        params: { period: { type: "week" }, daily_minutes: 444 },
      } as RuleLayer,
    ];
    const r = run(
      rules,
      [
        shift("2026-01-05 08:00", "2026-01-05 16:00"),
        shift("2026-01-06 08:00", "2026-01-06 15:00"),
      ],
      "2026-01-05",
      "2026-01-06",
    );
    expect(otMinutes(r)).toBe(36);
  });

  it("daily_norm without a daily norm configured gives no overtime", () => {
    const rules = [
      ot("daily_norm"),
      {
        id: "norm",
        primitive: "norm",
        source: "x",
        params: { period: { type: "week" } },
      } as RuleLayer,
    ];
    expect(
      otMinutes(
        run(rules, [shift("2026-01-05 06:00", "2026-01-05 18:00")], "2026-01-05", "2026-01-05"),
      ),
    ).toBe(0);
  });

  it("outside_planned: time outside the planned shift is overtime", () => {
    const planned = [shift("2026-01-05 08:00", "2026-01-05 16:00", { id: "p" })];
    const r = run(
      [ot("outside_planned")],
      [shift("2026-01-05 07:30", "2026-01-05 17:00", { plannedShiftId: "p" })],
      "2026-01-05",
      "2026-01-05",
      { planned },
    );
    expect(otMinutes(r)).toBe(90);
  });

  it("period_norm: a 2-week norm period evens out a long and a short week", () => {
    const rules = [
      ot("period_norm"),
      {
        id: "norm",
        primitive: "norm",
        source: "x",
        params: { period: { type: "weeks", weeks: 2, anchor: "2026-01-05" } },
      } as RuleLayer,
    ];
    const long = ["05", "06", "07", "08", "09"].map((d) =>
      shift(`2026-01-${d} 08:00`, `2026-01-${d} 17:00`),
    ); // 45 h
    const short = ["12", "13", "14"].map((d) => shift(`2026-01-${d} 08:00`, `2026-01-${d} 17:00`)); // 27 h
    expect(otMinutes(run(rules, [...long, ...short], "2026-01-05", "2026-01-18"))).toBe(0);
    const weekly = run([ot("weekly_norm")], [...long, ...short], "2026-01-05", "2026-01-18");
    expect(otMinutes(weekly)).toBe(480);
  });

  it("two overtime rules: daily overtime minutes do not count towards the weekly norm", () => {
    const rules: RuleLayer[] = [
      { ...ot("daily_norm"), id: "ot-dag", priority: 10 },
      ot("weekly_norm"),
      {
        id: "norm",
        primitive: "norm",
        source: "x",
        params: { period: { type: "week" }, daily_minutes: 480 },
      },
    ];
    // Mon 10 h (120 daily OT), Tue–Fri 8 h → weekly regular = 480·5 = 2400 → 180 weekly OT.
    const days = [
      shift("2026-01-05 06:00", "2026-01-05 16:00"),
      ...["06", "07", "08", "09"].map((d) => shift(`2026-01-${d} 08:00`, `2026-01-${d} 16:00`)),
    ];
    const r = run(rules, days, "2026-01-05", "2026-01-11");
    const byRule = (id: string) =>
      r.lines.filter((l) => l.explanation.ruleId === id).reduce((s, l) => s + l.quantityMinutes, 0);
    expect(byRule("ot-dag")).toBe(120);
    expect(byRule("ot")).toBe(180);
  });
});
