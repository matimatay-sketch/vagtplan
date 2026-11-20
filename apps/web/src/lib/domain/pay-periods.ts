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

type FocusRow = { groupId: string; start: IsoDate; end: IsoDate; status: "open" | "closed" };

/**
 * What the payroll page should put first. Per group: the oldest period that
 * has ended but is not closed ("ready"), otherwise the running one. The list
 * keeps the last three months and the next month; older periods are counted.
 */
export function periodFocus<T extends FocusRow>(
  rows: readonly T[],
  today: IsoDate,
): { now: (T & { state: "ready" | "running" })[]; recent: T[]; older: number } {
  const groups = [...new Set(rows.map((r) => r.groupId))];
  const now = groups.flatMap((g): (T & { state: "ready" | "running" })[] => {
    const mine = rows.filter((r) => r.groupId === g).sort((a, b) => a.start.localeCompare(b.start));
    const ready = mine.find((r) => r.status === "open" && r.end < today);
    if (ready) return [{ ...ready, state: "ready" as const }];
    const running = mine.find((r) => r.status === "open" && r.start <= today && today <= r.end);
    return running ? [{ ...running, state: "running" as const }] : [];
  });
  const from = addDays(today, -92);
  const to = addDays(today, 31);
  const recent = rows.filter((r) => r.end >= from && r.start <= to);
  return { now, recent, older: rows.filter((r) => r.end < from).length };
}
