import { describe, expect, it } from "vitest";
import { shiftFormSchema, templateFormSchema } from "./schedule";

const base = {
  department_id: "30000000-0000-0000-0000-000000000001",
  employee_id: "50000000-0000-0000-0000-000000000002",
  date: "2026-01-05",
  start_time: "08:00",
  end_time: "16:00",
  break_minutes: "30",
  label: "Kasse",
  kind: "work",
};

describe("shiftFormSchema", () => {
  it("parses a normal shift", () => {
    expect(shiftFormSchema.parse(base)).toMatchObject({
      employee_id: "50000000-0000-0000-0000-000000000002",
      break_minutes: 30,
      endsNextDay: false,
    });
  });

  it("an end time before the start means the next day", () => {
    expect(
      shiftFormSchema.parse({ ...base, start_time: "22:00", end_time: "06:00", break_minutes: "0" })
        .endsNextDay,
    ).toBe(true);
  });

  it("an empty employee is an open shift", () => {
    expect(shiftFormSchema.parse({ ...base, employee_id: "" }).employee_id).toBeNull();
  });

  it("rejects equal times, invalid clock times and too long breaks", () => {
    expect(shiftFormSchema.safeParse({ ...base, end_time: "08:00" }).success).toBe(false);
    expect(shiftFormSchema.safeParse({ ...base, start_time: "8" }).success).toBe(false);
    const r = shiftFormSchema.safeParse({
      ...base,
      start_time: "08:00",
      end_time: "08:30",
      break_minutes: "30",
    });
    expect(r.success).toBe(false);
    expect(r.error!.issues[0]!.path).toEqual(["break_minutes"]);
  });
});

describe("templateFormSchema", () => {
  it("parses a template", () => {
    expect(
      templateFormSchema.parse({
        name: "Dag",
        start_time: "08:00",
        end_time: "16:00",
        break_minutes: "30",
        label: "",
        kind: "work",
        department_id: "",
      }),
    ).toEqual({
      name: "Dag",
      start_time: "08:00",
      end_time: "16:00",
      break_minutes: 30,
      label: null,
      kind: "work",
      department_id: null,
    });
  });
});
