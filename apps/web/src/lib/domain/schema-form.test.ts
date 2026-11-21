import { describe, expect, it } from "vitest";
import {
  parseAgreementDocument,
  ruleSchemas,
  type AgreementRegistry,
} from "@vagtplan/rules-engine";
import {
  describeSchema,
  holidayRows,
  inheritedRules,
  initialValue,
  setHoliday,
  unwrap,
} from "./schema-form";

describe("describeSchema", () => {
  it("reads objects, enums, nullable numbers and unions", () => {
    const norm = describeSchema(ruleSchemas.norm);
    expect(norm.kind).toBe("object");
    if (norm.kind !== "object") throw new Error();
    const fields = Object.fromEntries(norm.fields.map(([k, s]) => [k, s]));
    const period = describeSchema(fields.period!);
    expect(period).toMatchObject({ kind: "union", discriminator: "type" });
    if (period.kind !== "union") throw new Error();
    expect(period.options.map((o) => o.value)).toEqual(["week", "weeks"]);
    expect(describeSchema(fields.holiday_reduction!)).toEqual({
      kind: "enum",
      values: ["none", "one_fifth_on_weekdays"],
    });
    expect(unwrap(fields.daily_minutes!).nullable).toBe(true);
    expect(describeSchema(fields.daily_minutes!)).toEqual({ kind: "number", int: true });
  });

  it("recognises dates, times, month-days and pay codes", () => {
    const vacation = describeSchema(ruleSchemas.vacation);
    if (vacation.kind !== "object") throw new Error();
    const f = Object.fromEntries(vacation.fields);
    expect(describeSchema(f.holiday_year_start!)).toEqual({ kind: "string", format: "month_day" });
    const night = describeSchema(ruleSchemas.night_work);
    if (night.kind !== "object") throw new Error();
    expect(describeSchema(Object.fromEntries(night.fields).from!)).toEqual({
      kind: "string",
      format: "time",
    });
    const min = describeSchema(ruleSchemas.min_shift);
    if (min.kind !== "object") throw new Error();
    expect(describeSchema(Object.fromEntries(min.fields).pay_code!)).toEqual({
      kind: "string",
      format: "pay_code",
    });
    const norm = describeSchema(ruleSchemas.norm);
    if (norm.kind !== "object") throw new Error();
    const period = describeSchema(Object.fromEntries(norm.fields).period!);
    if (period.kind !== "union") throw new Error();
    const weeks = describeSchema(period.options[1]!.schema);
    if (weeks.kind !== "object") throw new Error();
    expect(describeSchema(Object.fromEntries(weeks.fields).anchor!)).toEqual({
      kind: "string",
      format: "date",
    });
  });
});

describe("initialValue", () => {
  it("builds a new list item from defaults (empty, never invented values)", () => {
    const absence = describeSchema(ruleSchemas.absence);
    if (absence.kind !== "object") throw new Error();
    const types = describeSchema(Object.fromEntries(absence.fields).types!);
    if (types.kind !== "array") throw new Error();
    expect(initialValue(types.element)).toEqual({
      code: "",
      label: "",
      payment: "full",
      pay_code: null,
      counts_towards_norm: false,
      paid_from_seniority_months: null,
      entitlement: null,
    });
  });

  it("takes the first option of a union", () => {
    const norm = describeSchema(ruleSchemas.norm);
    if (norm.kind !== "object") throw new Error();
    expect(initialValue(Object.fromEntries(norm.fields).period!)).toEqual({ type: "week" });
  });
});

describe("holidays", () => {
  const params = {
    holidays: ["juledag", "grundlovsdag"],
    partial: [{ key: "grundlovsdag", from: "12:00" }],
  };

  it("lists every known day in date order with its date, choice and half-day time", () => {
    const rows = holidayRows(params, 2026);
    expect(rows[0]).toMatchObject({ key: "nytaarsdag", date: "2026-01-01", on: false });
    expect(rows.find((r) => r.key === "grundlovsdag")).toMatchObject({
      date: "2026-06-05",
      on: true,
      from: "12:00",
    });
    expect(rows.find((r) => r.key === "juledag")).toMatchObject({ on: true, from: null });
    // Abolished days come last, without a date.
    expect(rows.at(-1)).toMatchObject({ key: "store_bededag", date: null });
    const dated = rows.filter((r) => r.date).map((r) => r.date!);
    expect(dated).toEqual([...dated].sort());
  });

  it("ticks, unticks and makes half days", () => {
    const on = setHoliday(params, "langfredag", { on: true });
    expect(on.holidays).toEqual(["juledag", "grundlovsdag", "langfredag"]);
    const half = setHoliday(on, "juledag", { on: true, from: "12:00" });
    expect(half.partial).toEqual([
      { key: "grundlovsdag", from: "12:00" },
      { key: "juledag", from: "12:00" },
    ]);
    const whole = setHoliday(half, "grundlovsdag", { on: true, from: null });
    expect(whole.partial).toEqual([{ key: "juledag", from: "12:00" }]);
    const off = setHoliday(whole, "juledag", { on: false });
    expect(off).toEqual({ holidays: ["grundlovsdag", "langfredag"], partial: [] });
  });
});

describe("inheritedRules", () => {
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
        id: "helligdage",
        primitive: "holiday_calendar",
        label: "Helligdage",
        source: "Lov",
        params: { holidays: ["juledag"] },
      },
    ],
  });
  const registry: AgreementRegistry = { base: [base] };

  it("gives the parent's merged rules by id", () => {
    const r = inheritedRules(registry, { inherits_from: "base", valid_from: "2026-01-01" });
    expect(r.helligdage).toMatchObject({
      primitive: "holiday_calendar",
      label: "Helligdage",
      params: { holidays: ["juledag"], partial: [] },
    });
  });

  it("is empty without a parent or with an unknown one", () => {
    expect(inheritedRules(registry, { inherits_from: null, valid_from: "2026-01-01" })).toEqual({});
    expect(inheritedRules(registry, { inherits_from: "x", valid_from: "2026-01-01" })).toEqual({});
  });
});
