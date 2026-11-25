import { addDays, parseIsoDate } from "./civil-date";

/**
 * When an automatic reminder is sent (dates are local to the organization).
 * The same rule as `private.reminder_due` in the database.
 *
 * - weekly: on the chosen ISO weekdays (1 = Monday);
 * - monthly: on `dayOfMonth`, or the last day of a shorter month;
 * - quarterly: like monthly, in the `month`-th month (1–3) of each quarter;
 * - yearly: like monthly, in `month` (1–12).
 */
export const REMINDER_FREQUENCIES = ["weekly", "monthly", "quarterly", "yearly"] as const;
export type ReminderFrequency = (typeof REMINDER_FREQUENCIES)[number];

export type ReminderSchedule = {
  frequency: ReminderFrequency;
  weekdays: readonly number[];
  dayOfMonth: number;
  month: number;
};

const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export function isReminderDue(s: ReminderSchedule, date: string): boolean {
  const { y, m, d } = parseIsoDate(date);
  if (s.frequency === "weekly") {
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7;
    return s.weekdays.includes(dow);
  }
  if (d !== Math.min(s.dayOfMonth, daysInMonth(y, m))) return false;
  if (s.frequency === "quarterly") return ((m - 1) % 3) + 1 === s.month;
  if (s.frequency === "yearly") return m === s.month;
  return true;
}

/** The first day from `from` (included) the reminder is sent, within two years. */
export function nextReminderDate(s: ReminderSchedule, from: string): string | null {
  let date = from;
  for (let i = 0; i < 800; i++) {
    if (isReminderDue(s, date)) return date;
    date = addDays(date, 1);
  }
  return null;
}
