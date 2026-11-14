import { describe, expect, it } from "vitest";
import { parseAgreementDocument, type AgreementRegistry } from "@vagtplan/rules-engine";
import { copyDocument, localDocument, nextVersion, validateDocument } from "./agreement-edit";

const base = parseAgreementDocument({
  id: "base",
  name: "Base",
  kind: "base",
  version: 1,
  valid_from: "2020-01-01",
  valid_to: null,
  inherits_from: null,
  source: "Lov",
  rules: [
    {
      id: "hviletid",
      primitive: "rest",
      source: "Lov",
      params: { daily_minutes: 660, weekly_minutes: 1440, weekly_period: "calendar_week" },
    },
  ],
});
const detail = parseAgreementDocument({
  id: "detail",
  name: "Detail",
  kind: "agreement",
  version: 3,
  valid_from: "2026-01-01",
  valid_to: null,
  inherits_from: "base",
  source: "OK",
  rules: [
    {
      id: "aften",
      primitive: "time_window_supplement",
      source: "§ 5",
      params: {
        windows: [{ days: ["weekday"], from: "18:00", to: "24:00" }],
        amount: { type: "ore_per_hour", ore: 2500 },
        pay_code: "AFTEN",
      },
    },
  ],
});
const registry: AgreementRegistry = { base: [base], detail: [detail] };

describe("agreement documents", () => {
  it("a copy gets a new id, name and version 1, and keeps the rules and inheritance", () => {
    const c = copyDocument(detail, {
      id: "detail-egen",
      name: "Detail (egen)",
      validFrom: "2026-01-01",
    });
    expect(c).toMatchObject({
      id: "detail-egen",
      name: "Detail (egen)",
      version: 1,
      valid_from: "2026-01-01",
      valid_to: null,
      inherits_from: "base",
      kind: "agreement",
    });
    expect(c.rules).toEqual(detail.rules);
  });
  it("the next version starts on its date and is open-ended", () => {
    expect(nextVersion(detail, "2027-04-01")).toMatchObject({
      version: 4,
      valid_from: "2027-04-01",
      valid_to: null,
    });
  });
  it("a local agreement inherits from its parent and starts empty", () => {
    expect(
      localDocument({
        id: "lokal-1",
        name: "Lokalaftale",
        parent: "detail",
        validFrom: "2026-06-01",
      }),
    ).toMatchObject({
      kind: "local",
      inherits_from: "detail",
      rules: [],
      version: 1,
    });
  });

  it("validates the schema and the merged rules against the registry", () => {
    expect(validateDocument(registry, nextVersion(detail, "2027-01-01"))).toEqual({
      ok: true,
      errors: [],
      warnings: [],
    });
    const broken = { ...detail, rules: [{ ...detail.rules[0]!, params: { pay_code: "AFTEN" } }] };
    const r = validateDocument(registry, broken);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/aften/);
    expect(validateDocument(registry, { not: "a document" }).ok).toBe(false);
  });

  it("warns when a value is worse than the law without a legal basis", () => {
    const shorter = parseAgreementDocument({
      ...nextVersion(detail, "2027-01-01"),
      rules: [...detail.rules, { id: "hviletid", params: { daily_minutes: 600 } }],
    });
    const r = validateDocument(registry, shorter);
    expect(r.ok).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});
