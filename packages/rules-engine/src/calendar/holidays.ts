import { addDays, type IsoDate } from "../time/local-time";

/** Anonymous Gregorian algorithm (Meeus/Jones/Butcher). */
export function easterSunday(year: number): IsoDate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const pad = (n: number) => String(n).padStart(2, "0");
const fixed = (month: number, day: number) => (year: number) => `${year}-${pad(month)}-${pad(day)}`;
const easter = (offset: number) => (year: number) => addDays(easterSunday(year), offset);

/**
 * Known day keys. Which of them count as holidays is decided by the
 * agreement document (basis-dk lists the statutory ones).
 */
export const HOLIDAY_DEFINITIONS: Record<string, (year: number) => IsoDate | null> = {
  nytaarsdag: fixed(1, 1),
  skaertorsdag: easter(-3),
  langfredag: easter(-2),
  paaskedag: easter(0),
  anden_paaskedag: easter(1),
  // Abolished as a holiday from 2024.
  store_bededag: (y) => (y < 2024 ? addDays(easterSunday(y), 26) : null),
  kristi_himmelfartsdag: easter(39),
  pinsedag: easter(49),
  anden_pinsedag: easter(50),
  juledag: fixed(12, 25),
  anden_juledag: fixed(12, 26),
  // Days that are only special under some agreements:
  foerste_maj: fixed(5, 1),
  grundlovsdag: fixed(6, 5),
  juleaftensdag: fixed(12, 24),
  nytaarsaftensdag: fixed(12, 31),
};

export type HolidayKey = keyof typeof HOLIDAY_DEFINITIONS;
export type HolidayCalendarParams = {
  holidays: string[];
  partial?: { key: string; from: string }[];
};
export type HolidayInfo = { key: string; from: string | null };

/** Map of local date → holiday info for the given years, sorted by date. */
export function buildHolidayCalendar(
  params: HolidayCalendarParams,
  years: number[],
): Map<IsoDate, HolidayInfo> {
  const entries: [IsoDate, HolidayInfo][] = [];
  for (const year of years) {
    for (const key of params.holidays) {
      const def = HOLIDAY_DEFINITIONS[key];
      if (!def) throw new Error(`Unknown holiday key: ${key}`);
      const date = def(year);
      if (!date) continue;
      const from = params.partial?.find((p) => p.key === key)?.from ?? null;
      entries.push([date, { key, from }]);
    }
  }
  entries.sort(([a], [b]) => a.localeCompare(b));
  return new Map(entries);
}
