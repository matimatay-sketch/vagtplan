import { describe, expect, it } from "vitest";
import { rolloutSchema, rotationSchema, slotSchema } from "./rotation";

const G = "80000000-0000-0000-0000-000000000001";

describe("rotation forms", () => {
  it("a week template is a rotation of one week", () => {
    expect(
      rotationSchema.parse({
        name: "Standarduge",
        department_id: G,
        kind: "week",
        length_weeks: "",
      }),
    ).toEqual({ name: "Standarduge", department_id: G, length_weeks: 1 });
    expect(
      rotationSchema.parse({
        name: "Turnus",
        department_id: G,
        kind: "rotation",
        length_weeks: "3",
      }).length_weeks,
    ).toBe(3);
    expect(
      rotationSchema.safeParse({
        name: "T",
        department_id: G,
        kind: "rotation",
        length_weeks: "53",
      }).success,
    ).toBe(false);
  });

  it("parses a slot with breaks", () => {
    const r = slotSchema.parse({
      rotation_id: G,
      line_id: G,
      week_index: "1",
      weekday: "5",
      start_time: "22:00",
      end_time: "06:00",
      breaks: JSON.stringify([{ start: "02:00", minutes: 30, paid: false }]),
      supplement_type_ids: "[]",
      label: "",
      kind: "work",
    });
    expect(r).toMatchObject({
      week_index: 1,
      weekday: 5,
      breaks: [{ start: "02:00", nextDay: true }],
    });
  });

  it("validates rollouts: Monday start, weeks, assignments", () => {
    const base = {
      rotation_id: G,
      start_date: "2027-01-04",
      weeks: "8",
      assignments: JSON.stringify([{ lineId: G, employeeId: null, startWeek: 0 }]),
    };
    expect(rolloutSchema.parse(base)).toMatchObject({
      weeks: 8,
      assignments: [{ lineId: G, employeeId: null, startWeek: 0 }],
    });
    expect(rolloutSchema.safeParse({ ...base, start_date: "2027-01-05" }).success).toBe(false);
    expect(rolloutSchema.safeParse({ ...base, weeks: "0" }).success).toBe(false);
  });
});
