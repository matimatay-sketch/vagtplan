/** Where copies of shifts and weeks go. Pure; dates are local calendar dates. */
import { addDays, type IsoDate } from "./civil-date";
import { weekStartOf } from "./schedule-time";

/**
 * A shift on `from` copied to the chosen days (in its week) and, for each of
 * the following `weeks - 1` weeks, to the same weekdays again (the shift's own
 * weekday included). The shift's own date is never a target.
 */
export function copyDates(from: IsoDate, days: readonly IsoDate[], weeks: number): IsoDate[] {
  const base = days.length ? [...new Set(days)] : [from];
  const out = new Set<IsoDate>();
  for (let w = 0; w < Math.max(1, weeks); w++)
    for (const d of [...base, ...(w > 0 ? [from] : [])]) out.add(addDays(d, 7 * w));
  out.delete(from);
  return [...out].sort();
}

export type WeekTarget = { kind: "next"; weeks: number } | { kind: "week"; date: IsoDate };

/** The week starts a week is copied to. Never the week itself. */
export function weekTargets(weekStart: IsoDate, target: WeekTarget): IsoDate[] {
  if (target.kind === "next")
    return Array.from({ length: Math.max(1, Math.min(target.weeks, 26)) }, (_, i) =>
      addDays(weekStart, 7 * (i + 1)),
    );
  const w = weekStartOf(target.date);
  return w === weekStart ? [] : [w];
}
