/**
 * Schedule proposals from the AI assistant. Claude answers with pseudonymized
 * shifts in local time; this checks and converts them before they are saved as
 * draft shifts (which the rules engine then validates like any other draft).
 */
import { z } from "zod";
import type { Pseudonyms } from "./pseudonyms";
import { localParts } from "./schedule-time";

/** The structured output requested from the model. */
export const proposalOutputSchema = z.object({
  shifts: z.array(
    z.object({
      /** MEDARBEJDER_n, or null for an open shift. */
      employee: z.string().nullable(),
      date: z.string(),
      start: z.string(),
      end: z.string(),
      unpaid_break_minutes: z.number().int(),
      label: z.string().nullable(),
    }),
  ),
  notes: z.string(),
});
export type ProposalOutput = z.infer<typeof proposalOutputSchema>;
export type ProposedShift = ProposalOutput["shifts"][number];

export type CheckedShift = {
  employeeId: string | null;
  date: string;
  start: string;
  end: string;
  endsNextDay: boolean;
  breakMinutes: number;
  label: string | null;
};
export type ProposalProblem = {
  index: number;
  code: "unknown_employee" | "outside_week" | "invalid_time" | "break_too_long" | "overlap";
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export function checkProposal(
  shifts: readonly ProposedShift[],
  ctx: {
    pseudonyms: Pseudonyms;
    weekDates: readonly string[];
    /** Employees that may be planned (in the department). */
    employeeIds: readonly string[];
    /** Existing shifts in the week (UTC instants). */
    existing: readonly { employeeId: string | null; start: string; end: string }[];
  },
): { shifts: CheckedShift[]; problems: ProposalProblem[] } {
  const out: CheckedShift[] = [];
  const problems: ProposalProblem[] = [];
  // Busy ranges per employee in minutes from the week's first day (local time).
  const dayIndex = (d: string) => ctx.weekDates.indexOf(d);
  const busy = new Map<string, [number, number][]>();
  const addBusy = (id: string, from: number, to: number) =>
    busy.set(id, [...(busy.get(id) ?? []), [from, to]]);
  for (const e of ctx.existing) {
    if (!e.employeeId) continue;
    const a = localParts(e.start);
    const b = localParts(e.end);
    const da = Math.max(-1, dayIndex(a.date));
    const db = dayIndex(b.date) === -1 ? da + 1 : dayIndex(b.date);
    addBusy(e.employeeId, da * 1440 + toMin(a.time), db * 1440 + toMin(b.time));
  }

  shifts.forEach((s, index) => {
    const fail = (code: ProposalProblem["code"]) => problems.push({ index, code });
    const employeeId = s.employee === null ? null : ctx.pseudonyms.idOf(s.employee);
    if (s.employee !== null && (!employeeId || !ctx.employeeIds.includes(employeeId)))
      return fail("unknown_employee");
    const day = dayIndex(s.date);
    if (day === -1) return fail("outside_week");
    if (!HHMM.test(s.start) || !HHMM.test(s.end) || s.start === s.end) return fail("invalid_time");
    const endsNextDay = toMin(s.end) <= toMin(s.start);
    const length = toMin(s.end) - toMin(s.start) + (endsNextDay ? 1440 : 0);
    if (s.unpaid_break_minutes < 0 || s.unpaid_break_minutes >= length)
      return fail("break_too_long");
    const from = day * 1440 + toMin(s.start);
    const to = from + length;
    if (employeeId) {
      if ((busy.get(employeeId) ?? []).some(([a, b]) => from < b && a < to)) return fail("overlap");
      addBusy(employeeId, from, to);
    }
    out.push({
      employeeId,
      date: s.date,
      start: s.start,
      end: s.end,
      endsNextDay,
      breakMinutes: s.unpaid_break_minutes,
      label: s.label?.trim() ? s.label.trim().slice(0, 40) : null,
    });
  });
  return { shifts: out, problems };
}
