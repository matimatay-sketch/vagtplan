import "server-only";
import {
  shiftsToIntervals,
  validateNotice,
  validateSchedule,
  type Violation,
} from "@vagtplan/rules-engine";
import type { createClient } from "@/lib/supabase/server";
import { addDays, type IsoDate } from "@/lib/domain/civil-date";
import { zonedTime } from "@/lib/domain/schedule-time";
import {
  EMPLOYEE_ENGINE_SELECT,
  engineInputFor,
  loadAgreements,
  type EmployeeEngineRow,
} from "@/lib/engine";

type Client = Awaited<ReturnType<typeof createClient>>;

/** Rolling rules (48 h average, weekend off) need history before the week. */
const HISTORY_DAYS = 130;

export type EmployeeViolation = Violation & { employeeId: string };

/**
 * Validates the draft schedule (all departments) of the given employees for
 * one week, plus notice for shifts that would be published now.
 */
export async function validateWeek(
  supabase: Client,
  opts: { employeeIds: string[]; weekStart: IsoDate; timezone: string; noticeFor?: NoticeShift[] },
): Promise<EmployeeViolation[]> {
  const ids = [...new Set(opts.employeeIds)];
  if (ids.length === 0) return [];
  const weekEnd = addDays(opts.weekStart, 6);
  const from = new Date(zonedTime(addDays(opts.weekStart, -HISTORY_DAYS))).toISOString();
  const to = new Date(zonedTime(addDays(opts.weekStart, 8))).toISOString();

  const [data, { data: shifts, error }, { data: employees, error: empError }] = await Promise.all([
    loadAgreements(supabase),
    supabase.rpc("shifts_for_validation", { p_employee_ids: ids, p_from: from, p_to: to }),
    supabase.from("employee").select(EMPLOYEE_ENGINE_SELECT).in("id", ids),
  ]);
  if (error) throw error;
  if (empError) throw empError;

  const out: EmployeeViolation[] = [];
  for (const e of (employees ?? []) as unknown as EmployeeEngineRow[]) {
    const input = engineInputFor(e, data, opts.timezone);
    if (input.contracts.length === 0) continue;
    const own = (shifts ?? []).filter((s) => s.employee_id === e.id);
    const intervals = shiftsToIntervals(
      own.map((s) => ({
        id: s.id,
        start: s.start_at,
        end: s.end_at,
        breakMinutes: s.break_minutes,
        kind: s.kind,
      })),
    );
    const { violations } = validateSchedule({
      ...input,
      intervals,
      from: opts.weekStart,
      to: weekEnd,
    });
    out.push(...violations.map((v) => ({ ...v, employeeId: e.id })));

    const notice = (opts.noticeFor ?? []).filter((n) => n.employeeId === e.id);
    if (notice.length) {
      const r = validateNotice({
        ...input,
        now: new Date().toISOString(),
        items: notice.map((n) => ({ intervalId: n.shiftId, start: n.start, change: n.change })),
      });
      out.push(...r.violations.map((v) => ({ ...v, employeeId: e.id })));
    }
  }
  return out;
}

export type NoticeShift = {
  shiftId: string;
  employeeId: string;
  start: string;
  change: "new" | "changed" | "removed";
};

/** Stable key used to match a violation with an override reason. */
export function violationKey(v: EmployeeViolation): string {
  return [v.employeeId, v.code, v.ruleId, v.date, [...v.intervalIds].sort().join("+")].join("|");
}
