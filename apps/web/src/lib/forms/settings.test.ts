import { describe, expect, it } from "vitest";
import {
  normDefaultsSchema,
  noticeSchema,
  ruleHandlingFromForm,
  supplementTypeSchema,
  leaveRulesSchema,
} from "./settings";

describe("noticeSchema", () => {
  it("empty means: follow the agreement", () => {
    expect(noticeSchema.parse({ notice_publish_hours: "", notice_change_hours: "" })).toEqual({
      notice_publish_hours: null,
      notice_change_hours: null,
    });
  });
  it("parses whole hours and rejects others", () => {
    expect(noticeSchema.parse({ notice_publish_hours: "336", notice_change_hours: "96" })).toEqual({
      notice_publish_hours: 336,
      notice_change_hours: 96,
    });
    expect(
      noticeSchema.safeParse({ notice_publish_hours: "1,5", notice_change_hours: "" }).success,
    ).toBe(false);
    expect(
      noticeSchema.safeParse({ notice_publish_hours: "-1", notice_change_hours: "" }).success,
    ).toBe(false);
  });
});

describe("ruleHandlingFromForm", () => {
  it("keeps only explicit choices for known codes", () => {
    expect(
      ruleHandlingFromForm({
        "rule:REST_DAILY": "allow",
        "rule:BREAK_MISSING": "block",
        "rule:MIN_SHIFT": "",
        "rule:FAKE": "allow",
      }),
    ).toEqual({
      REST_DAILY: "allow",
      BREAK_MISSING: "block",
    });
  });
});

describe("supplementTypeSchema", () => {
  it("converts kroner to øre and percent to basis points", () => {
    expect(
      supplementTypeSchema.parse({
        name: "Ansvar",
        pay_code: "ansvar",
        amount_type: "per_hour",
        amount: "25,50",
      }),
    ).toEqual({
      name: "Ansvar",
      pay_code: "ANSVAR",
      amount_type: "per_hour",
      amount: 2550,
      employee_selectable: false,
    });
    expect(
      supplementTypeSchema.parse({
        name: "Smuds",
        pay_code: "SMUDS",
        amount_type: "percent",
        amount: "12,5",
      }).amount,
    ).toBe(1250);
  });
  it("an unticked checkbox means employees cannot choose the supplement", () => {
    const base = { name: "Smuds", pay_code: "SMUDS", amount_type: "fixed", amount: "25" };
    expect(supplementTypeSchema.parse(base).employee_selectable).toBe(false);
    expect(
      supplementTypeSchema.parse({ ...base, employee_selectable: "on" }).employee_selectable,
    ).toBe(true);
  });
  it("rejects invalid pay codes and amounts", () => {
    expect(
      supplementTypeSchema.safeParse({
        name: "X",
        pay_code: "æøå",
        amount_type: "fixed",
        amount: "10",
      }).success,
    ).toBe(false);
    expect(
      supplementTypeSchema.safeParse({
        name: "X",
        pay_code: "X",
        amount_type: "fixed",
        amount: "abc",
      }).success,
    ).toBe(false);
  });
});

describe("leaveRulesSchema", () => {
  it("empty selects follow the agreement; choices become typed values", () => {
    expect(leaveRulesSchema.parse({})).toEqual({});
    expect(
      leaveRulesSchema.parse({
        entitlement_proration: "remaining_months",
        on_call_counts_as_rest: "false",
        leave_day_basis: "planned_days",
        transfer_allowed: "true",
        transfer_only_above_days: "20",
        payout_allowed: "false",
        payout_only_above_days: "",
      }),
    ).toEqual({
      entitlement_proration: "remaining_months",
      on_call_counts_as_rest: false,
      leave_day_basis: "planned_days",
      transfer_allowed: true,
      transfer_only_above_days: 20,
      payout_allowed: false,
    });
  });
  it("the holiday norm reduction is one of the engine's choices", () => {
    expect(leaveRulesSchema.parse({ holiday_norm_reduction: "planned_shift" })).toEqual({
      holiday_norm_reduction: "planned_shift",
    });
    expect(leaveRulesSchema.parse({ holiday_norm_reduction: "" })).toEqual({});
    // An unknown value follows the agreement, like the other choices.
    expect(leaveRulesSchema.parse({ holiday_norm_reduction: "x" })).toEqual({});
  });
  it("a limit only applies when the move is allowed, and must be whole days 0–366", () => {
    expect(leaveRulesSchema.parse({ transfer_only_above_days: "20" })).toEqual({});
    const r = leaveRulesSchema.safeParse({
      transfer_allowed: "true",
      transfer_only_above_days: "2,5",
    });
    expect(r.error!.issues[0]!.path).toEqual(["transfer_only_above_days"]);
  });
});

describe("normDefaultsSchema", () => {
  it("reads whole percentages and yes/no", () => {
    expect(
      normDefaultsSchema.parse({
        norm_percent_work: "100",
        norm_percent_on_call: "33",
        norm_in_pay_work: "false",
        norm_in_pay_on_call: "true",
      }),
    ).toEqual({
      norm_percent_work: 100,
      norm_percent_on_call: 33,
      norm_in_pay_work: false,
      norm_in_pay_on_call: true,
    });
  });

  it("requires a whole number from 0 to 1000", () => {
    const ok = {
      norm_percent_work: "100",
      norm_in_pay_work: "false",
      norm_in_pay_on_call: "false",
    };
    expect(normDefaultsSchema.safeParse({ ...ok, norm_percent_on_call: "" }).success).toBe(false);
    expect(normDefaultsSchema.safeParse({ ...ok, norm_percent_on_call: "1001" }).success).toBe(
      false,
    );
    expect(normDefaultsSchema.safeParse({ ...ok, norm_percent_on_call: "150" }).success).toBe(true);
    expect(normDefaultsSchema.safeParse({ ...ok, norm_percent_on_call: "0" }).success).toBe(true);
  });
});
