/**
 * Break conversions between forms (local "HH:MM"), the database (ISO instant
 * or null) and moved shifts. Server-side helpers use the rules engine's
 * DST-safe wall-clock conversion.
 */
import { addDays, formatInstant, parseInstant, toLocal, wallTime } from "@vagtplan/rules-engine";
import type { FormBreak, FormProjectRow } from "@/lib/forms/schedule";
import type { ProjectAllocation } from "@/lib/domain/projects";
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

export function formProjectsToDb(
  rows: readonly FormProjectRow[],
  shiftDate: string,
): ProjectAllocation[] {
  const at = (time: string, nextDay: boolean) =>
    formatInstant(wallTime(nextDay ? addDays(shiftDate, 1) : shiftDate, time, TZ));
  return rows.map((r) => ({
    project_id: r.project_id,
    start_at: r.mode === "span" && r.from ? at(r.from, r.nextDayFrom) : null,
    end_at: r.mode === "span" && r.to ? at(r.to, r.nextDayTo) : null,
    minutes: r.mode === "minutes" ? r.minutes : null,
  }));
}

/** Keeps time spans at the same local time relative to the shift's start date. */
export function moveAllocations(
  rows: readonly ProjectAllocation[],
  fromDate: string,
  toDate: string,
): ProjectAllocation[] {
  const move = (iso: string | null) => {
    if (!iso) return null;
    const local = toLocal(parseInstant(iso), TZ);
    return formatInstant(
      wallTime(addDays(toDate, diffDays(local.date, fromDate)), hhmm(local.minuteOfDay), TZ),
    );
  };
  return rows.map((r) => ({ ...r, start_at: move(r.start_at), end_at: move(r.end_at) }));
}
