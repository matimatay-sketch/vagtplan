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
import type { DbBreak } from "@/lib/domain/breaks";
import {
  effectiveHandling,
  organizationLayerFrom,
  type Handling,
  type RuleHandlingMap,
} from "./rule-handling";
import {
  EMPLOYEE_ENGINE_SELECT,
  engineInputFor,
  loadAgreements,
  type EmployeeEngineRow,
} from "@/lib/engine";

type Client = Awaited<ReturnType<typeof createClient>>;

/** Rolling rules (48 h average, weekend off) need history before the week. */
const HISTORY_DAYS = 130;

export type EmployeeViolation = Violation & {
  employeeId: string;
  /** How the organization handles this violation at publishing (always flagged). */
  handling: Handling;
};

export type OrganizationSettingsRow = {
  notice_publish_hours: number | null;
  notice_change_hours: number | null;
  rule_handling: RuleHandlingMap;
};

export async function loadOrganizationSettings(
  supabase: Client,
  organizationId: string,
): Promise<OrganizationSettingsRow> {
  const { data } = await supabase
    .from("organization_settings")
    .select("notice_publish_hours, notice_change_hours, rule_handling")
    .eq("organization_id", organizationId)
    .maybeSingle();
  return {
    notice_publish_hours: data?.notice_publish_hours ?? null,
    notice_change_hours: data?.notice_change_hours ?? null,
    rule_handling: (data?.rule_handling ?? {}) as RuleHandlingMap,
  };
}

/**
 * Validates the draft schedule (all departments) of the given employees for
 * one week, plus notice for shifts that would be published now.
 */
export async function validateWeek(
  supabase: Client,
  opts: {
    organizationId: string;
    employeeIds: string[];
    weekStart: IsoDate;
    timezone: string;
    noticeFor?: NoticeShift[];
  },
): Promise<EmployeeViolation[]> {
  const ids = [...new Set(opts.employeeIds)];
  if (ids.length === 0) return [];
  const weekEnd = addDays(opts.weekStart, 6);
  const from = new Date(zonedTime(addDays(opts.weekStart, -HISTORY_DAYS))).toISOString();
  const to = new Date(zonedTime(addDays(opts.weekStart, 8))).toISOString();

  const [
    data,
    settings,
    { data: shifts, error },
    { data: employees, error: empError },
    { data: absences },
  ] = await Promise.all([
    loadAgreements(supabase),
    loadOrganizationSettings(supabase, opts.organizationId),
    supabase.rpc("shifts_for_validation", { p_employee_ids: ids, p_from: from, p_to: to }),
    supabase.from("employee").select(EMPLOYEE_ENGINE_SELECT).in("id", ids),
    // Approved absence is neutral in the 48-hour average.
    supabase
      .from("absence")
      .select("id, employee_id, type_code, from_date, to_date")
      .in("employee_id", ids)
      .eq("status", "approved")
      .lte("from_date", weekEnd)
      .gte("to_date", addDays(opts.weekStart, -HISTORY_DAYS)),
  ]);
  if (error) throw error;
  if (empError) throw empError;

  const out: EmployeeViolation[] = [];
  for (const e of (employees ?? []) as unknown as EmployeeEngineRow[]) {
    const input = {
      ...engineInputFor(e, data, opts.timezone),
      organizationLayer: organizationLayerFrom(settings),
    };
    const tag = (v: Violation): EmployeeViolation => ({
      ...v,
      employeeId: e.id,
      handling: effectiveHandling(v.code, v.severity, settings.rule_handling),
    });
    if (input.contracts.length === 0) continue;
    const own = (shifts ?? []).filter((s) => s.employee_id === e.id);
    const intervals = shiftsToIntervals(
      own.map((s) => ({
        id: s.id,
        start: s.start_at,
        end: s.end_at,
        breaks: (s.breaks as unknown as DbBreak[]).map((b) => ({
          start: b.start_at,
          minutes: b.minutes,
          paid: b.paid,
        })),
        kind: s.kind,
      })),
    );
    const { violations } = validateSchedule({
      ...input,
      intervals,
      absences: (absences ?? [])
        .filter((a) => a.employee_id === e.id)
        .map((a) => ({ id: a.id, type: a.type_code, from: a.from_date, to: a.to_date })),
      from: opts.weekStart,
      to: weekEnd,
    });
    out.push(...violations.map(tag));

    const notice = (opts.noticeFor ?? []).filter((n) => n.employeeId === e.id);
    if (notice.length) {
      const r = validateNotice({
        ...input,
        now: new Date().toISOString(),
        items: notice.map((n) => ({ intervalId: n.shiftId, start: n.start, change: n.change })),
      });
      out.push(...r.violations.map(tag));
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
