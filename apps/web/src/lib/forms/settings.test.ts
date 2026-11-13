import { describe, expect, it } from "vitest";
import { noticeSchema, ruleHandlingFromForm, supplementTypeSchema } from "./settings";

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
