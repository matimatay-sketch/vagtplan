import { localParts } from "./schedule-time";

export type DbBreak = { start_at: string | null; minutes: number; paid: boolean };
export type TemplateBreak = { start_time: string | null; minutes: number; paid: boolean };
export type EditableBreak = { start: string; minutes: number; paid: boolean };

/** Database breaks → editable rows (local time, "" = not placed). Browser-safe. */
export function dbBreaksToForm(breaks: readonly DbBreak[]): EditableBreak[] {
  return breaks.map((b) => ({
    start: b.start_at ? localParts(b.start_at).time : "",
    minutes: b.minutes,
    paid: b.paid,
  }));
}

export function templateBreaksToForm(breaks: readonly TemplateBreak[]): EditableBreak[] {
  return breaks.map((b) => ({
    start: b.start_time?.slice(0, 5) ?? "",
    minutes: b.minutes,
    paid: b.paid,
  }));
}

export function unpaidMinutes(breaks: readonly { minutes: number; paid: boolean }[]): number {
  return breaks.filter((b) => !b.paid).reduce((s, b) => s + b.minutes, 0);
}
