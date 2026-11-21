import { describe, expect, it } from "vitest";
import { RULE_CATALOG, effectiveHandling, organizationLayerFrom } from "./rule-handling";

describe("rule handling", () => {
  it("defaults follow the engine severity", () => {
    expect(effectiveHandling("REST_DAILY", "BLOCKING", {})).toBe("block");
    expect(effectiveHandling("BREAK_MISSING", "WARNING", {})).toBe("allow");
  });
  it("the organization can block warnings or permanently allow blocking rules", () => {
    expect(effectiveHandling("BREAK_MISSING", "WARNING", { BREAK_MISSING: "block" })).toBe("block");
    expect(effectiveHandling("REST_DAILY", "BLOCKING", { REST_DAILY: "allow" })).toBe("allow");
  });
  it("the catalog covers all engine violation codes once", () => {
    const codes = RULE_CATALOG.map((r) => r.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toEqual(
      expect.arrayContaining([
        "REST_DAILY",
        "REST_WEEKLY",
        "MAX_WEEKLY_AVERAGE",
        "BREAK_MISSING",
        "YOUNG_MAX_DAILY",
        "YOUNG_MAX_WEEKLY",
        "YOUNG_BREAK",
        "MIN_SHIFT",
        "NIGHT_AVERAGE",
        "WEEKEND_OFF",
        "NOTICE_LATE",
      ]),
    );
  });
});

describe("organizationLayerFrom", () => {
  it("is empty when no notice is configured", () => {
    expect(
      organizationLayerFrom({ notice_publish_hours: null, notice_change_hours: null }),
    ).toBeNull();
  });
  it("builds a notice rule with only the configured values", () => {
    expect(organizationLayerFrom({ notice_publish_hours: 72, notice_change_hours: null })).toEqual({
      rules: [
        {
          id: "varsling",
          primitive: "notice",
          label: "Varsling (opsætning)",
          source: "Virksomhedens opsætning",
          params: { publish_notice_hours: 72 },
        },
      ],
    });
  });
});

describe("organizationLayerFrom – leave rules", () => {
  it("turns the consultant's choices into merge-by-primitive rules; empty keys follow the agreement", () => {
    expect(
      organizationLayerFrom({
        notice_publish_hours: null,
        notice_change_hours: null,
        leave_rules: {
          entitlement_proration: "remaining_months",
          on_call_counts_as_rest: false,
          leave_day_basis: "planned_days",
          transfer_allowed: true,
          transfer_only_above_days: 20,
          payout_allowed: false,
        },
      }),
    ).toEqual({
      rules: [
        {
          id: "org-fravaer",
          primitive: "absence",
          merge_into: "primitive",
          source: "Virksomhedens opsætning",
          params: { entitlement_proration: "remaining_months" },
        },
        {
          id: "org-raadighed",
          primitive: "on_call",
          merge_into: "primitive",
          source: "Virksomhedens opsætning",
          params: { counts_as_rest: false },
        },
        {
          id: "org-ferie",
          primitive: "vacation",
          merge_into: "primitive",
          source: "Virksomhedens opsætning",
          params: {
            leave_day_basis: "planned_days",
            transfer: { allowed: true, only_above_days: 20 },
            payout: { allowed: false, only_above_days: null },
          },
        },
      ],
    });
  });
  it("ignores empty leave rules", () => {
    expect(
      organizationLayerFrom({
        notice_publish_hours: null,
        notice_change_hours: null,
        leave_rules: {},
      }),
    ).toBeNull();
  });
});

describe("organizationLayerFrom – holiday norm reduction", () => {
  it("is merged into every norm rule", () => {
    expect(
      organizationLayerFrom({
        notice_publish_hours: null,
        notice_change_hours: null,
        leave_rules: { holiday_norm_reduction: "planned_shift" },
      }),
    ).toEqual({
      rules: [
        {
          id: "org-normtid",
          primitive: "norm",
          merge_into: "primitive",
          source: "Virksomhedens opsætning",
          params: { holiday_reduction: "planned_shift" },
        },
      ],
    });
  });
});
