/**
 * Browser-safe time helpers for the schedule views (no Temporal polyfill in
 * the client bundle). Wall-clock values are always Europe/Copenhagen.
 */
import { addDays, isoWeekday, parseIsoDate, type IsoDate } from "./civil-date";

export const TZ = "Europe/Copenhagen";

const partsFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function localParts(iso: string | number | Date): { date: IsoDate; time: string } {
  const p = Object.fromEntries(
    partsFormat.formatToParts(new Date(iso)).map((x) => [x.type, x.value]),
  );
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

/** UTC offset (ms) of Copenhagen at an instant. */
function offsetAt(ms: number): number {
  const { date, time } = localParts(ms);
  const { y, m, d } = parseIsoDate(date);
  const [hh, mm] = time.split(":").map(Number) as [number, number];
  return Date.UTC(y, m - 1, d, hh, mm) - Math.floor(ms / 60_000) * 60_000;
}

/** Instant of a Copenhagen wall-clock time (non-existent times move forward). */
export function zonedTime(date: IsoDate, hhmm = "00:00"): number {
  const { y, m, d } = parseIsoDate(date);
  const [hh, mm] = hhmm.split(":").map(Number) as [number, number];
  const naive = Date.UTC(y, m - 1, d, hh, mm);
  let guess = naive - offsetAt(naive);
  guess = naive - offsetAt(guess);
  return guess;
}

export function weekStartOf(date: IsoDate): IsoDate {
  return addDays(date, 1 - isoWeekday(date));
}

export function weekDates(weekStart: IsoDate): IsoDate[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function isoWeekNumber(date: IsoDate): number {
  const thursday = addDays(date, 4 - isoWeekday(date));
  const { y } = parseIsoDate(thursday);
  const jan1 = `${y}-01-01`;
  const days = (Date.UTC(...dateArgs(thursday)) - Date.UTC(...dateArgs(jan1))) / 86_400_000;
  return Math.floor(days / 7) + 1;
}

function dateArgs(d: IsoDate): [number, number, number] {
  const { y, m, d: day } = parseIsoDate(d);
  return [y, m - 1, day];
}

/** Position of a shift on a day's timeline as fractions of the real day length. */
export function barPosition(
  startIso: string,
  endIso: string,
  date: IsoDate,
): { left: number; width: number; clippedStart: boolean; clippedEnd: boolean } | null {
  const dayStart = zonedTime(date);
  const dayEnd = zonedTime(addDays(date, 1));
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (end <= dayStart || start >= dayEnd) return null;
  const length = dayEnd - dayStart;
  const s = Math.max(start, dayStart);
  const e = Math.min(end, dayEnd);
  return {
    left: (s - dayStart) / length,
    width: (e - s) / length,
    clippedStart: start < dayStart,
    clippedEnd: end > dayEnd,
  };
}

/** "08:00–16:00" (+1 when ending another day). */
export function timeRange(startIso: string, endIso: string): string {
  const s = localParts(startIso);
  const e = localParts(endIso);
  return `${s.time}–${e.time}${e.date !== s.date ? " (+1)" : ""}`;
}

export function durationMinutes(startIso: string, endIso: string, breakMinutes = 0): number {
  return (
    Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60_000) - breakMinutes
  );
}

const dayLabelFormat = new Intl.DateTimeFormat("da-DK", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: TZ,
});

/** "fre. 27. nov. 08:00–14:00" in Copenhagen time. */
export function shiftWhen(startIso: string, endIso: string): string {
  return `${dayLabelFormat.format(new Date(startIso))} ${timeRange(startIso, endIso)}`;
}
