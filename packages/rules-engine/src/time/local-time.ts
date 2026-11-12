import { Temporal } from "temporal-polyfill";

/** Calendar date "YYYY-MM-DD" (no time zone). */
export type IsoDate = string;
/** Epoch milliseconds (UTC instant). */
export type Instant = number;

export const MINUTE = 60_000;

/** Parses an ISO instant. A zone designator (Z or ±hh:mm) is required. */
export function parseInstant(value: string): Instant {
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(value)) throw new Error(`Instant without zone: ${value}`);
  return Temporal.Instant.from(value).epochMilliseconds;
}

export function formatInstant(ms: Instant): string {
  return new Date(ms).toISOString().replace(".000Z", "Z");
}

export type LocalTime = { date: IsoDate; minuteOfDay: number; weekday: number };

export function toLocal(ms: Instant, tz: string): LocalTime {
  const z = Temporal.Instant.fromEpochMilliseconds(ms).toZonedDateTimeISO(tz);
  return {
    date: z.toPlainDate().toString(),
    minuteOfDay: z.hour * 60 + z.minute,
    weekday: z.dayOfWeek,
  };
}

export function localDate(ms: Instant, tz: string): IsoDate {
  return Temporal.Instant.fromEpochMilliseconds(ms).toZonedDateTimeISO(tz).toPlainDate().toString();
}

export function startOfLocalDay(date: IsoDate, tz: string): Instant {
  return Temporal.PlainDate.from(date).toZonedDateTime({ timeZone: tz }).epochMilliseconds;
}

/**
 * Instant of a local wall-clock time ("HH:MM", "24:00" = next midnight).
 * Non-existent times (spring forward) move forward; ambiguous times (fall back)
 * resolve to the earlier instant ("compatible").
 */
export function wallTime(date: IsoDate, hhmm: string, tz: string): Instant {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) throw new Error(`Invalid time: ${hhmm}`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h === 24 && min === 0) return startOfLocalDay(addDays(date, 1), tz);
  return Temporal.PlainDate.from(date)
    .toPlainDateTime({ hour: h, minute: min })
    .toZonedDateTime(tz, { disambiguation: "compatible" }).epochMilliseconds;
}

export function localDayLengthMinutes(date: IsoDate, tz: string): number {
  return (startOfLocalDay(addDays(date, 1), tz) - startOfLocalDay(date, tz)) / MINUTE;
}

/** Local dates that the half-open interval [start, end) touches. */
export function localDaysOverlapping(start: Instant, end: Instant, tz: string): IsoDate[] {
  if (end <= start) return [];
  const days: IsoDate[] = [];
  let d = localDate(start, tz);
  while (startOfLocalDay(d, tz) < end) {
    days.push(d);
    d = addDays(d, 1);
  }
  return days;
}

export function addDays(date: IsoDate, n: number): IsoDate {
  return Temporal.PlainDate.from(date).add({ days: n }).toString();
}

export function diffDays(a: IsoDate, b: IsoDate): number {
  return Temporal.PlainDate.from(b).until(Temporal.PlainDate.from(a), { largestUnit: "days" }).days;
}

/** 1 = Monday … 7 = Sunday */
export function isoWeekday(date: IsoDate): number {
  return Temporal.PlainDate.from(date).dayOfWeek;
}

export function isoWeekStart(date: IsoDate): IsoDate {
  return addDays(date, 1 - isoWeekday(date));
}

export function yearOf(date: IsoDate): number {
  return Number(date.slice(0, 4));
}

export function parseHhmm(hhmm: string): number {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) throw new Error(`Invalid time: ${hhmm}`);
  return Number(m[1]) * 60 + Number(m[2]);
}
