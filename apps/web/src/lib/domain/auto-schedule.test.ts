import { describe, expect, it } from "vitest";
import { autoSchedule, type PlanEmployee, type PlanTemplate } from "./auto-schedule";

const week = ["2026-12-07", "2026-12-08", "2026-12-09", "2026-12-10", "2026-12-11"];
const early: PlanTemplate = {
  id: "early",
  name: "Tidlig",
  start: "07:00",
  end: "15:00",
  paidMinutes: 450,
};
const late: PlanTemplate = {
  id: "late",
  name: "Sen",
  start: "14:00",
  end: "22:00",
  paidMinutes: 450,
};
const night: PlanTemplate = {
  id: "night",
  name: "Nat",
  start: "22:00",
  end: "06:00",
  paidMinutes: 480,
};
const emp = (
  id: string,
  normHours: number | null,
  extra: Partial<PlanEmployee> = {},
): PlanEmployee => ({
  id,
  name: id,
  targetMinutes: normHours === null ? null : normHours * 60,
  alreadyMinutes: 0,
  busyDates: [],
  unavailable: [],
  preferredDates: [],
  ...extra,
});
const planOf = (r: ReturnType<typeof autoSchedule>, id: string) =>
  r.shifts.filter((s) => s.employeeId === id).map((s) => `${s.date} ${s.templateId}`);

describe("autoSchedule", () => {
  it("fills an employee up to the weekly norm with the template", () => {
    const r = autoSchedule({ dates: week, templates: [early], employees: [emp("a", 37)] });
    expect(planOf(r, "a")).toEqual(week.map((d) => `${d} early`));
    expect(r.summary).toEqual([{ employeeId: "a", targetMinutes: 2220, plannedMinutes: 2250 }]);
  });

  it("stops when one more shift would move further from the norm", () => {
    // 10 hours: one shift (7.5 h) is closer than two (15 h).
    const r = autoSchedule({ dates: week, templates: [early], employees: [emp("a", 10)] });
    expect(r.shifts).toHaveLength(1);
  });

  it("spreads the employees over days and templates, so every day is covered", () => {
    const r = autoSchedule({
      dates: week.slice(0, 2),
      templates: [early, late],
      employees: [emp("a", 15), emp("b", 15)],
    });
    const byDay = (d: string) =>
      r.shifts
        .filter((s) => s.date === d)
        .map((s) => s.templateId)
        .sort();
    expect(byDay(week[0]!)).toEqual(["early", "late"]);
    expect(byDay(week[1]!)).toEqual(["early", "late"]);
    // One shift a day at most per employee.
    expect(new Set(planOf(r, "a").map((x) => x.slice(0, 10))).size).toBe(2);
  });

  it("leaves out days with absence, existing shifts or a wish for a day off, and uses wished days first", () => {
    const r = autoSchedule({
      dates: week,
      templates: [early],
      employees: [
        emp("a", 15, {
          busyDates: [week[0]!, week[1]!],
          preferredDates: [week[4]!],
        }),
      ],
    });
    expect(planOf(r, "a")).toEqual([`${week[2]} early`, `${week[4]} early`]);
  });

  it("a part-day wish for time off rules out only the templates it overlaps", () => {
    const r = autoSchedule({
      dates: [week[0]!],
      templates: [early, late],
      employees: [emp("a", 7.5, { unavailable: [{ date: week[0]!, from: "06:00", to: "12:00" }] })],
    });
    expect(planOf(r, "a")).toEqual([`${week[0]} late`]);
  });

  it("counts the hours already planned, and plans no one without a norm", () => {
    const r = autoSchedule({
      dates: week,
      templates: [early],
      employees: [emp("a", 15, { alreadyMinutes: 450 }), emp("b", null)],
    });
    expect(planOf(r, "a")).toHaveLength(1);
    expect(planOf(r, "b")).toEqual([]);
    expect(r.summary.find((s) => s.employeeId === "b")).toEqual({
      employeeId: "b",
      targetMinutes: null,
      plannedMinutes: 0,
    });
  });

  it("never repeats a combination the rules turned down, and plans over midnight", () => {
    const r = autoSchedule({
      dates: week.slice(0, 2),
      templates: [night],
      employees: [emp("a", 8)],
      forbidden: [`a|${week[0]}|night`],
    });
    expect(r.shifts).toEqual([
      {
        employeeId: "a",
        templateId: "night",
        date: week[1],
        start: "22:00",
        end: "06:00",
        endsNextDay: true,
      },
    ]);
  });

  it("is the same every time for the same week", () => {
    const input = {
      dates: week,
      templates: [early, late],
      employees: [emp("c", 30), emp("a", 22), emp("b", 30)],
    };
    expect(autoSchedule(input)).toEqual(autoSchedule(input));
  });
});
