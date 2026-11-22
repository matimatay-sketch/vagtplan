import { describe, expect, it } from "vitest";
import { absenceExportRows } from "./absence-export";

const weekdays = (from: string, to: string) => {
  const out: string[] = [];
  for (
    let d = new Date(`${from}T00:00:00Z`);
    d <= new Date(`${to}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1)
  )
    if (d.getUTCDay() % 6 !== 0) out.push(d.toISOString().slice(0, 10));
  return out;
};

describe("absenceExportRows", () => {
  const base = {
    employee: { number: "1002", name: "Mads Medarbejder" },
    period: { start: "2027-01-04", end: "2027-01-17" },
    daysOf: weekdays,
    // 37 h a week: 7 h 24 min (444 min) a weekday.
    minutesOn: () => 444,
  };

  it("one row per absence, cut to the period, with days and the days' norm in minutes", () => {
    const rows = absenceExportRows({
      ...base,
      absences: [
        // Thursday 31 Dec – Tuesday 5 Jan: only Mon 4 and Tue 5 are in the period.
        { code: "sick", label: "Sygdom", from: "2026-12-31", to: "2027-01-05" },
        // Friday 15 – Monday 18 Jan: Friday only (the weekend has no leave days).
        { code: "vacation", label: "Ferie", from: "2027-01-15", to: "2027-01-18" },
      ],
    });
    expect(rows).toEqual([
      expect.objectContaining({
        kind: "absence",
        employeeNumber: "1002",
        payCode: "sick",
        label: "Sygdom",
        unit: "absence",
        quantityDays: 200,
        quantityMinutes: 888,
        dateFrom: "2027-01-04",
        dateTo: "2027-01-05",
        periodStart: "2027-01-04",
        periodEnd: "2027-01-17",
      }),
      expect.objectContaining({
        payCode: "vacation",
        quantityDays: 100,
        quantityMinutes: 444,
        dateFrom: "2027-01-15",
        dateTo: "2027-01-17",
      }),
    ]);
  });

  it("leaves out absence with no leave days in the period", () => {
    expect(
      absenceExportRows({
        ...base,
        absences: [{ code: "sick", label: "Sygdom", from: "2027-01-09", to: "2027-01-10" }],
      }),
    ).toEqual([]);
  });
});
