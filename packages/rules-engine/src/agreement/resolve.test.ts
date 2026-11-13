import { describe, expect, it } from "vitest";
import { parseAgreementDocument } from "./schema";
import { resolveAgreement, type AgreementRegistry } from "./resolve";

const basis = parseAgreementDocument({
  id: "basis-dk",
  name: "Basis",
  kind: "base",
  version: 1,
  valid_from: "2024-07-01",
  valid_to: null,
  inherits_from: null,
  source: "Lov",
  rules: [
    {
      id: "hviletid",
      primitive: "rest",
      source: "Arbejdstidsloven",
      params: { daily_minutes: 660, weekly_minutes: 1440, weekly_period: "calendar_week" },
    },
    {
      id: "max-48",
      primitive: "max_weekly_average",
      source: "Arbejdstidsloven",
      params: {
        max_average_minutes: 2880,
        warning_average_minutes: 2640,
        reference_months: 4,
        reference_anchor: "01-01",
      },
    },
    {
      id: "pause",
      primitive: "break",
      source: "Arbejdsmiljø",
      params: { after_minutes: 360, min_minutes: null, paid: false },
    },
  ],
});

const agreementV1 = parseAgreementDocument({
  id: "test-ok",
  name: "Test",
  kind: "agreement",
  version: 1,
  valid_from: "2026-01-01",
  valid_to: "2026-06-30",
  inherits_from: "basis-dk",
  source: "Test",
  rules: [
    { id: "pause", params: { min_minutes: 30, paid: true } },
    {
      id: "aften",
      primitive: "time_window_supplement",
      source: "Test § 1",
      params: {
        windows: [{ days: ["weekday"], from: "18:00", to: "24:00" }],
        amount: { type: "ore_per_hour", ore: 2500 },
        pay_code: "AFTEN",
      },
    },
  ],
});
const agreementV2 = parseAgreementDocument({
  ...agreementV1,
  version: 2,
  valid_from: "2026-07-01",
  valid_to: null,
  rules: [
    ...agreementV1.rules.filter((r) => r.id !== "aften"),
    {
      id: "aften",
      primitive: "time_window_supplement",
      source: "Test § 1",
      params: {
        windows: [{ days: ["weekday"], from: "18:00", to: "24:00" }],
        amount: { type: "ore_per_hour", ore: 3000 },
        pay_code: "AFTEN",
      },
    },
  ],
});
const local = parseAgreementDocument({
  id: "lokal",
  name: "Lokalaftale",
  kind: "local",
  version: 1,
  valid_from: "2026-01-01",
  valid_to: null,
  inherits_from: null,
  source: "Lokal",
  rules: [{ id: "aften", params: { amount: { type: "ore_per_hour", ore: 4000 } } }],
});

const registry: AgreementRegistry = {
  "basis-dk": [basis],
  "test-ok": [agreementV1, agreementV2],
  lokal: [local],
};

describe("resolveAgreement", () => {
  it("inherits rules from basis-dk and merges changed fields only", () => {
    const r = resolveAgreement(registry, { agreementId: "test-ok", date: "2026-03-01" });
    expect(r.chain).toEqual([
      { id: "basis-dk", version: 1 },
      { id: "test-ok", version: 1 },
    ]);
    const pause = r.rules.find((x) => x.id === "pause")!;
    expect(pause.params).toEqual({
      after_minutes: 360,
      min_minutes: 30,
      paid: true,
      paid_counts_as_working_time: true,
    });
    expect(pause.layers.map((l) => l.agreementId)).toEqual(["basis-dk", "test-ok"]);
    expect(r.rules.map((x) => x.id)).toEqual(["hviletid", "max-48", "pause", "aften"]);
  });

  it("picks the version valid on the date", () => {
    const amount = (date: string) =>
      (
        resolveAgreement(registry, { agreementId: "test-ok", date }).rules.find(
          (x) => x.id === "aften",
        )!.params as {
          amount: { ore: number };
        }
      ).amount.ore;
    expect(amount("2026-06-30")).toBe(2500);
    expect(amount("2026-07-01")).toBe(3000);
  });

  it("throws when no version is valid", () => {
    expect(() =>
      resolveAgreement(registry, { agreementId: "test-ok", date: "2025-12-31" }),
    ).toThrow(/no version/i);
  });

  it("applies local agreement and contract layers last", () => {
    const r = resolveAgreement(registry, {
      agreementId: "test-ok",
      localAgreementId: "lokal",
      contractOverrides: { rules: [{ id: "pause", params: { min_minutes: 45 } }] },
      date: "2026-03-01",
    });
    const aften = r.rules.find((x) => x.id === "aften")!;
    expect((aften.params as { amount: { ore: number } }).amount.ore).toBe(4000);
    expect(aften.layers.at(-1)).toEqual({ agreementId: "lokal", version: 1 });
    expect(
      (r.rules.find((x) => x.id === "pause")!.params as { min_minutes: number }).min_minutes,
    ).toBe(45);
  });

  it("removes rules marked remove: true", () => {
    const r = resolveAgreement(registry, {
      agreementId: "test-ok",
      contractOverrides: { rules: [{ id: "aften", remove: true }] },
      date: "2026-03-01",
    });
    expect(r.rules.some((x) => x.id === "aften")).toBe(false);
  });

  it("warns when a layer is less favourable than the law without legal basis", () => {
    const r = resolveAgreement(registry, {
      agreementId: "test-ok",
      contractOverrides: {
        rules: [
          { id: "hviletid", params: { daily_minutes: 480 } },
          { id: "max-48", remove: true },
        ],
      },
      date: "2026-03-01",
    });
    expect(r.warnings).toEqual([
      expect.objectContaining({
        code: "BELOW_LAW_MINIMUM",
        ruleId: "hviletid",
        path: "params.daily_minutes",
        base: 660,
        value: 480,
      }),
      expect.objectContaining({ code: "LAW_RULE_REMOVED", ruleId: "max-48" }),
    ]);
  });

  it("accepts a deviation that states its legal basis", () => {
    const r = resolveAgreement(registry, {
      agreementId: "test-ok",
      contractOverrides: {
        rules: [
          {
            id: "hviletid",
            params: { daily_minutes: 480 },
            legal_basis: "Aftale om nedsat hviletid § 2",
          },
        ],
      },
      date: "2026-03-01",
    });
    expect(r.warnings).toEqual([]);
  });

  it("rejects an invalid final rule with a clear message", () => {
    expect(() =>
      resolveAgreement(registry, {
        agreementId: "test-ok",
        contractOverrides: {
          rules: [{ id: "aften", params: { amount: { type: "percent_of_base", bp: -5 } } }],
        },
        date: "2026-03-01",
      }),
    ).toThrow(/aften/);
  });

  it("rejects changing the primitive of an inherited rule", () => {
    expect(() =>
      resolveAgreement(registry, {
        agreementId: "test-ok",
        contractOverrides: { rules: [{ id: "pause", primitive: "rest" }] },
        date: "2026-03-01",
      }),
    ).toThrow(/primitive/);
  });
});

describe("parseAgreementDocument", () => {
  it("rejects unknown primitives and duplicate rule ids", () => {
    expect(() =>
      parseAgreementDocument({
        ...basis,
        rules: [{ id: "x", primitive: "magic", source: "x", params: {} }],
      }),
    ).toThrow();
    expect(() =>
      parseAgreementDocument({ ...basis, rules: [basis.rules[0], basis.rules[0]] }),
    ).toThrow(/duplicate/i);
  });
});
