import {
  addDays,
  daysInMonth,
  diffDays,
  makeIsoDate,
  parseIsoDate,
  type IsoDate,
} from "./civil-date";

export type PayPeriodGroupSpec =
  | { frequency: "monthly"; month_start_day: number; anchor_date: null }
  | { frequency: "weekly" | "biweekly"; anchor_date: IsoDate; month_start_day: null };

export type PayPeriod = { start: IsoDate; end: IsoDate };

function monthlyStartContaining(date: IsoDate, startDay: number): IsoDate {
  const { y, m, d } = parseIsoDate(date);
  if (d >= startDay) return makeIsoDate(y, m, startDay);
  return m === 1 ? makeIsoDate(y - 1, 12, startDay) : makeIsoDate(y, m - 1, startDay);
}

function nextMonthlyStart(start: IsoDate): IsoDate {
  const { y, m, d } = parseIsoDate(start);
  return m === 12
    ? makeIsoDate(y + 1, 1, d)
    : makeIsoDate(y, m + 1, Math.min(d, daysInMonth(y, m + 1)));
}

/** `count` consecutive pay periods, starting with the one containing `date`. */
export function payPeriodsFrom(
  group: PayPeriodGroupSpec,
  date: IsoDate,
  count: number,
): PayPeriod[] {
  const periods: PayPeriod[] = [];
  if (group.frequency === "monthly") {
    let start = monthlyStartContaining(date, group.month_start_day);
    for (let i = 0; i < count; i++) {
      const next = nextMonthlyStart(start);
      periods.push({ start, end: addDays(next, -1) });
      start = next;
    }
    return periods;
  }
  const length = group.frequency === "weekly" ? 7 : 14;
  const offset = diffDays(date, group.anchor_date);
  let start = addDays(group.anchor_date, Math.floor(offset / length) * length);
  for (let i = 0; i < count; i++) {
    periods.push({ start, end: addDays(start, length - 1) });
    start = addDays(start, length);
  }
  return periods;
}
