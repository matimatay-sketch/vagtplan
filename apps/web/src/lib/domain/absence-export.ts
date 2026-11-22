/**
 * Approved absence as rows for the payroll export. Pure: the caller gives the
 * leave days of a span (the rules engine's leaveDays) and each day's norm.
 */
import type { ExportRow } from "./export";

type IsoDate = string;

export function absenceExportRows(input: {
  employee: { number: string; name: string };
  absences: readonly { code: string; label: string; from: IsoDate; to: IsoDate }[];
  period: { start: IsoDate; end: IsoDate };
  /** Leave days from–to (weekdays without holidays, or planned days). */
  daysOf: (from: IsoDate, to: IsoDate) => readonly IsoDate[];
  /** The day's norm in minutes (hours of absence). */
  minutesOn: (date: IsoDate) => number;
}): ExportRow[] {
  const { period } = input;
  return input.absences.flatMap((a) => {
    const from = a.from > period.start ? a.from : period.start;
    const to = a.to < period.end ? a.to : period.end;
    if (to < from) return [];
    const days = input.daysOf(from, to);
    if (days.length === 0) return [];
    return [
      {
        kind: "absence" as const,
        employeeNumber: input.employee.number,
        employeeName: input.employee.name,
        payCode: a.code,
        label: a.label,
        unit: "absence" as const,
        quantityMinutes: days.reduce((sum, d) => sum + input.minutesOn(d), 0),
        quantityDays: days.length * 100,
        rateOre: 0,
        amountOre: 0,
        periodStart: period.start,
        periodEnd: period.end,
        dateFrom: from,
        dateTo: to,
      },
    ];
  });
}
