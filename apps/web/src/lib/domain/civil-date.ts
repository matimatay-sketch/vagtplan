/**
 * Calendar-date helpers working on ISO "YYYY-MM-DD" strings. Civil dates have
 * no time zone; arithmetic is done in UTC so DST can never shift a day.
 */
export type IsoDate = string;

const DAY_MS = 86_400_000;

export function parseIsoDate(value: IsoDate): { y: number; m: number; d: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid ISO date: ${value}`);
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const { y, m, d } = parseIsoDate(value);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function toUtcMs(value: IsoDate): number {
  const { y, m, d } = parseIsoDate(value);
  return Date.UTC(y, m - 1, d);
}

function fromUtcMs(ms: number): IsoDate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(value: IsoDate, days: number): IsoDate {
  return fromUtcMs(toUtcMs(value) + days * DAY_MS);
}

export function diffDays(a: IsoDate, b: IsoDate): number {
  return Math.round((toUtcMs(a) - toUtcMs(b)) / DAY_MS);
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function isoWeekday(value: IsoDate): number {
  const day = new Date(toUtcMs(value)).getUTCDay();
  return day === 0 ? 7 : day;
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function makeIsoDate(y: number, m: number, d: number): IsoDate {
  return fromUtcMs(Date.UTC(y, m - 1, d));
}

/** Today's date in the given IANA time zone (default Europe/Copenhagen). */
export function todayIn(timeZone = "Europe/Copenhagen", now = new Date()): IsoDate {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
