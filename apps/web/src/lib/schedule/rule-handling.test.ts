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
