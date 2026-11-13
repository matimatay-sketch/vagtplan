/**
 * Break conversions between forms (local "HH:MM"), the database (ISO instant
 * or null) and moved shifts. Server-side helpers use the rules engine's
 * DST-safe wall-clock conversion.
 */
import { addDays, formatInstant, parseInstant, toLocal, wallTime } from "@vagtplan/rules-engine";
import type { FormBreak } from "@/lib/forms/schedule";
import { diffDays } from "@/lib/domain/civil-date";
import { dbBreaksToForm, type DbBreak } from "@/lib/domain/breaks";

export { dbBreaksToForm };
export type { DbBreak };

const TZ = "Europe/Copenhagen";
const hhmm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export function formBreaksToDb(breaks: readonly FormBreak[], shiftDate: string): DbBreak[] {
  return breaks.map((b) => ({
    start_at: b.start
      ? formatInstant(wallTime(b.nextDay ? addDays(shiftDate, 1) : shiftDate, b.start, TZ))
      : null,
    minutes: b.minutes,
    paid: b.paid,
  }));
}

/** Keeps placed breaks at the same local time relative to the shift's start date. */
export function moveDbBreaks(
  breaks: readonly DbBreak[],
  fromDate: string,
  toDate: string,
): DbBreak[] {
  return breaks.map((b) => {
    if (!b.start_at) return { ...b };
    const local = toLocal(parseInstant(b.start_at), TZ);
    const date = addDays(toDate, diffDays(local.date, fromDate));
    return { ...b, start_at: formatInstant(wallTime(date, hhmm(local.minuteOfDay), TZ)) };
  });
}

export function breakTotals(breaks: readonly DbBreak[]): { paid: number; unpaid: number } {
  return breaks.reduce(
    (t, b) =>
      b.paid ? { ...t, paid: t.paid + b.minutes } : { ...t, unpaid: t.unpaid + b.minutes },
    { paid: 0, unpaid: 0 },
  );
}
