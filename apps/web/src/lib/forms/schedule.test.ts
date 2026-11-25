import { describe, expect, it } from "vitest";
import { shiftFormSchema, templateFormSchema } from "./schedule";

const brk = (list: { start?: string; minutes: number; paid?: boolean }[]) =>
  JSON.stringify(
    list.map((b) => ({ start: b.start ?? "", minutes: b.minutes, paid: b.paid ?? false })),
  );

const base = {
  department_id: "30000000-0000-0000-0000-000000000001",
  employee_id: "50000000-0000-0000-0000-000000000002",
  date: "2026-01-05",
  start_time: "08:00",
  end_time: "16:00",
  breaks: brk([{ minutes: 30 }]),
  supplement_type_ids: "[]",
  label: "Kasse",
  kind: "work",
};

describe("shiftFormSchema", () => {
  it("reads the norm percent: empty is the default for the kind, 0–100 whole numbers", () => {
    expect(shiftFormSchema.parse(base)).toMatchObject({ norm_percent: null, norm_in_pay: null });
    expect(
      shiftFormSchema.parse({ ...base, kind: "on_call", norm_percent: "33", norm_in_pay: "true" }),
    ).toMatchObject({ norm_percent: 33, norm_in_pay: true });
    expect(
      shiftFormSchema.parse({ ...base, norm_percent: "0", norm_in_pay: "false" }),
    ).toMatchObject({ norm_percent: 0, norm_in_pay: false });
    // Above 100 % counts more than the real time (e.g. night work at 150 %).
    expect(shiftFormSchema.parse({ ...base, norm_percent: "150" })).toMatchObject({
      norm_percent: 150,
    });
    expect(shiftFormSchema.safeParse({ ...base, norm_percent: "1001" }).success).toBe(false);
    expect(shiftFormSchema.safeParse({ ...base, norm_percent: "33,5" }).success).toBe(false);
  });

  it("parses a normal shift with one unplaced break", () => {
    expect(shiftFormSchema.parse(base)).toMatchObject({
      employee_id: "50000000-0000-0000-0000-000000000002",
      breaks: [{ start: null, minutes: 30, paid: false, nextDay: false }],
      supplement_type_ids: [],
      endsNextDay: false,
    });
  });

  it("parses several breaks, paid and placed", () => {
    const r = shiftFormSchema.parse({
      ...base,
      breaks: brk([
        { start: "10:00", minutes: 15, paid: true },
        { start: "12:00", minutes: 30 },
      ]),
    });
    expect(r.breaks).toEqual([
      { start: "10:00", minutes: 15, paid: true, nextDay: false },
      { start: "12:00", minutes: 30, paid: false, nextDay: false },
    ]);
  });

  it("a placed break after midnight on a night shift belongs to the next day", () => {
    const r = shiftFormSchema.parse({
      ...base,
      start_time: "22:00",
      end_time: "06:00",
      breaks: brk([{ start: "02:00", minutes: 30 }]),
    });
    expect(r.breaks[0]).toMatchObject({ start: "02:00", nextDay: true });
    expect(r.endsNextDay).toBe(true);
  });

  it("rejects breaks outside the shift, too long in total, or with invalid values", () => {
    const bad = (breaks: string) => shiftFormSchema.safeParse({ ...base, breaks }).success;
    expect(bad(brk([{ start: "07:30", minutes: 15 }]))).toBe(false);
    expect(bad(brk([{ start: "15:45", minutes: 30 }]))).toBe(false);
    expect(bad(brk([{ minutes: 240 }, { minutes: 240 }]))).toBe(false);
    expect(bad(brk([{ minutes: 0 }]))).toBe(false);
    expect(bad("not json")).toBe(false);
  });

  it("an empty employee is an open shift and supplements are parsed", () => {
    const r = shiftFormSchema.parse({
      ...base,
      employee_id: "",
      supplement_type_ids: JSON.stringify(["70000000-0000-0000-0000-000000000001"]),
    });
    expect(r.employee_id).toBeNull();
    expect(r.supplement_type_ids).toEqual(["70000000-0000-0000-0000-000000000001"]);
  });

  it("rejects equal times and invalid clock times", () => {
    expect(shiftFormSchema.safeParse({ ...base, end_time: "08:00" }).success).toBe(false);
    expect(shiftFormSchema.safeParse({ ...base, start_time: "8" }).success).toBe(false);
  });
});

describe("templateFormSchema", () => {
  it("parses a template with breaks", () => {
    expect(
      templateFormSchema.parse({
        name: "Dag",
        start_time: "08:00",
        end_time: "16:00",
        breaks: brk([{ start: "12:00", minutes: 30 }]),
        supplement_type_ids: "[]",
        label: "",
        kind: "work",
        department_id: "",
      }),
    ).toEqual({
      name: "Dag",
      start_time: "08:00",
      end_time: "16:00",
      breaks: [{ start: "12:00", minutes: 30, paid: false, nextDay: false }],
      supplement_type_ids: [],
      required_competence_ids: [],
      posting_values: {},
      label: null,
      kind: "work",
      norm_percent: null,
      norm_in_pay: null,
      department_id: null,
    });
  });
});
