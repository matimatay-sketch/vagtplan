import { describe, expect, it } from "vitest";
import { contractSchema, employeeSchema, payPeriodGroupSchema } from "./schemas";

const today = "2026-11-12";

describe("employeeSchema", () => {
  const base = {
    employee_number: "1001",
    first_name: "Ida",
    last_name: "Ung",
    birth_date: "2010-05-20",
    email: "",
    phone: "",
    school_obligated: "on",
    school_obligation_ends_on: "",
    hired_on: "",
  };

  it("normalizes empty optionals to null and checkbox to boolean", () => {
    const r = employeeSchema(today).parse(base);
    expect(r).toMatchObject({ email: null, phone: null, school_obligated: true, hired_on: null });
  });

  it("rejects birth date in the future and invalid email", () => {
    const r = employeeSchema(today).safeParse({ ...base, birth_date: "2026-11-13", email: "x@" });
    expect(r.success).toBe(false);
    const paths = r.error!.issues.map((i) => i.path.join("."));
    expect(paths).toEqual(expect.arrayContaining(["birth_date", "email"]));
  });

  it("requires school_obligated when an end date is given", () => {
    const r = employeeSchema(today).safeParse({
      ...base,
      school_obligated: undefined,
      school_obligation_ends_on: "2027-06-30",
    });
    expect(r.success).toBe(false);
  });
});

describe("contractSchema", () => {
  const base = {
    agreement_id: "a0000000-0000-0000-0000-000000000002",
    local_agreement_id: "",
    pay_form: "hourly",
    weekly_hours: "15,5",
    pay_period_group_id: "40000000-0000-0000-0000-000000000002",
    staff_group: "Ekspedient",
    pay_step: "",
    seniority_date: "",
    valid_from: "2026-12-01",
    valid_to: "",
    exempt_from_registration: undefined,
    exemption_reason: "",
    exemption_since: "",
  };

  it("converts Danish hours to minutes", () => {
    const r = contractSchema.parse(base);
    expect(r.weekly_norm_minutes).toBe(930);
    expect(r.valid_to).toBeNull();
    expect(r.exempt_from_registration).toBe(false);
  });

  it("treats an absent checkbox (not posted by the browser) as false", () => {
    const { exempt_from_registration: _omit, ...withoutCheckbox } = base;
    const r = contractSchema.safeParse(withoutCheckbox);
    expect(r.success).toBe(true);
  });

  it("rejects valid_to before valid_from", () => {
    const r = contractSchema.safeParse({ ...base, valid_to: "2026-11-30" });
    expect(r.success).toBe(false);
    expect(r.error!.issues[0]!.path).toEqual(["valid_to"]);
  });

  it("accepts a one-day contract", () => {
    expect(contractSchema.safeParse({ ...base, valid_to: "2026-12-01" }).success).toBe(true);
  });

  it("requires reason and date for exemption", () => {
    const r = contractSchema.safeParse({ ...base, exempt_from_registration: "on" });
    expect(r.success).toBe(false);
    const paths = r.error!.issues.map((i) => i.path.join("."));
    expect(paths).toEqual(expect.arrayContaining(["exemption_reason", "exemption_since"]));
  });

  it.each(["-1", "80,5", "abc", ""])("rejects weekly hours %j", (weekly_hours) => {
    expect(contractSchema.safeParse({ ...base, weekly_hours }).success).toBe(false);
  });
});

describe("payPeriodGroupSchema", () => {
  it("requires a Monday anchor for weekly", () => {
    expect(
      payPeriodGroupSchema.safeParse({
        name: "Uge",
        frequency: "weekly",
        anchor_date: "2026-01-06",
        month_start_day: "",
      }).success,
    ).toBe(false);
    expect(
      payPeriodGroupSchema.parse({
        name: "Uge",
        frequency: "weekly",
        anchor_date: "2026-01-05",
        month_start_day: "",
      }),
    ).toEqual({
      name: "Uge",
      frequency: "weekly",
      anchor_date: "2026-01-05",
      month_start_day: null,
    });
  });

  it("requires start day 1–28 for monthly", () => {
    expect(
      payPeriodGroupSchema.safeParse({
        name: "M",
        frequency: "monthly",
        anchor_date: "",
        month_start_day: "29",
      }).success,
    ).toBe(false);
    expect(
      payPeriodGroupSchema.parse({
        name: "M",
        frequency: "monthly",
        anchor_date: "",
        month_start_day: "21",
      }),
    ).toEqual({
      name: "M",
      frequency: "monthly",
      anchor_date: null,
      month_start_day: 21,
    });
  });
});
