import "server-only";
import {
  dailyWorkingMinutes,
  roundRegistrations,
  shiftsToIntervals,
  validateSchedule,
  type Violation,
} from "@vagtplan/rules-engine";
import type { createClient } from "@/lib/supabase/server";
import type { AppContext } from "@/lib/auth";
import { addDays, type IsoDate } from "@/lib/domain/civil-date";
import { localParts, zonedTime } from "@/lib/domain/schedule-time";
import type { DbBreak } from "@/lib/domain/breaks";
import type { ProjectAllocation } from "@/lib/domain/projects";
import {
  EMPLOYEE_ENGINE_SELECT,
  engineInputFor,
  loadAgreements,
  type EmployeeEngineRow,
} from "@/lib/engine";
import { loadOrganizationSettings } from "@/lib/schedule/validate-week";
import { organizationLayerFrom } from "@/lib/schedule/rule-handling";

type Client = Awaited<ReturnType<typeof createClient>>;

/** Rest and daily rules look back this far into earlier registrations. */
const HISTORY_DAYS = 14;

export type TimeRow = {
  kind: "entry" | "missing";
  entryId: string | null;
  shiftId: string | null;
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  departmentId: string;
  departmentName: string;
  /** Local start date. */
  date: IsoDate;
  start: string;
  end: string | null;
  breaks: DbBreak[];
  projectAllocations: ProjectAllocation[];
  status: "open" | "pending" | "approved" | null;
  source: "stamp" | "planned" | "manual" | null;
  deviationReason: string | null;
  note: string | null;
  offline: boolean;
  approvedAt: string | null;
  approvedBy: string | null;
  version: number;
  isMine: boolean;
  plan: { start: string; end: string; breaks: DbBreak[] } | null;
  /** Work, on-call or a call-out (tilkald). */
  workKind: "work" | "on_call" | "call_out";
  /** Times after the agreement's rounding (null while open). */
  settled: { start: string; end: string } | null;
  violations: Violation[];
};

export type TimeOverview = {
  rows: TimeRow[];
  /** employeeId → local date → working minutes (the legal daily total). */
  daily: Record<string, Record<IsoDate, number>>;
  /** Employees whose contract exempts them from registration (on `to`). */
  exempt: Set<string>;
};

type RpcRow = {
  row_kind: string;
  entry_id: string | null;
  shift_id: string | null;
  employee_id: string;
  employee_name: string;
  employee_number: string;
  department_id: string;
  department_name: string;
  start_at: string;
  end_at: string | null;
  breaks: unknown;
  project_allocations: unknown;
  status: TimeRow["status"];
  source: TimeRow["source"];
  deviation_reason: string | null;
  note: string | null;
  offline: boolean;
  approved_at: string | null;
  approved_by_email: string | null;
  version: number;
  is_mine: boolean;
  plan_start: string | null;
  plan_end: string | null;
  plan_breaks: unknown;
  kind: "work" | "on_call" | "call_out" | null;
};

const engineBreaks = (b: DbBreak[]) =>
  b.map((x) => ({ start: x.start_at, minutes: x.minutes, paid: x.paid }));

/**
 * Registrations (and missing ones) between two local dates, with the legal
 * daily totals, the settled (rounded) times and rule violations in the actual
 * time. Visibility follows the database (own time, or time.* permissions).
 */
export async function loadTimeOverview(
  supabase: Client,
  ctx: AppContext,
  opts: { from: IsoDate; to: IsoDate; departmentId?: string | null; onlyMine?: boolean },
): Promise<TimeOverview> {
  const historyFrom = addDays(opts.from, -HISTORY_DAYS);
  const { data, error } = await supabase.rpc("time_overview", {
    p_from: new Date(zonedTime(historyFrom)).toISOString(),
    p_to: new Date(zonedTime(addDays(opts.to, 1))).toISOString(),
  });
  if (error) throw error;
  const all = ((data ?? []) as unknown as RpcRow[])
    .filter((r) => !opts.onlyMine || r.is_mine)
    .filter((r) => !opts.departmentId || r.department_id === opts.departmentId)
    .map((r): Omit<TimeRow, "settled" | "violations"> => ({
      kind: r.row_kind === "missing" ? "missing" : "entry",
      entryId: r.entry_id,
      shiftId: r.shift_id,
      employeeId: r.employee_id,
      employeeName: r.employee_name,
      employeeNumber: r.employee_number,
      departmentId: r.department_id,
      departmentName: r.department_name,
      date: localParts(r.start_at).date,
      start: r.start_at,
      end: r.end_at,
      breaks: (r.breaks ?? []) as DbBreak[],
      projectAllocations: (r.project_allocations ?? []) as ProjectAllocation[],
      status: r.status,
      source: r.source,
      deviationReason: r.deviation_reason,
      note: r.note,
      offline: r.offline,
      approvedAt: r.approved_at,
      approvedBy: r.approved_by_email,
      version: r.version,
      isMine: r.is_mine,
      plan:
        r.plan_start && r.plan_end
          ? { start: r.plan_start, end: r.plan_end, breaks: (r.plan_breaks ?? []) as DbBreak[] }
          : null,
      workKind: r.kind ?? "work",
    }));

  const employeeIds = [...new Set(all.map((r) => r.employeeId))];
  const [agreements, settings, { data: employees }] = await Promise.all([
    loadAgreements(supabase),
    loadOrganizationSettings(supabase, ctx.organization.id),
    employeeIds.length
      ? supabase
          .from("employee")
          .select(
            `${EMPLOYEE_ENGINE_SELECT}, exemptions:contract (exempt_from_registration, valid_from, valid_to)`,
          )
          .in("id", employeeIds)
      : Promise.resolve({ data: [] }),
  ]);

  const settledById = new Map<string, { start: string; end: string }>();
  const violationsById = new Map<string, Violation[]>();
  const daily: TimeOverview["daily"] = {};
  const exempt = new Set<string>();

  type Row = EmployeeEngineRow & {
    exemptions: {
      exempt_from_registration: boolean;
      valid_from: string;
      valid_to: string | null;
    }[];
  };
  for (const e of (employees ?? []) as unknown as Row[]) {
    if (
      e.exemptions.some(
        (c) =>
          c.exempt_from_registration &&
          c.valid_from <= opts.to &&
          (c.valid_to === null || c.valid_to >= opts.to),
      )
    )
      exempt.add(e.id);
    const input = {
      ...engineInputFor(e, agreements, ctx.organization.timezone),
      organizationLayer: organizationLayerFrom(settings),
    };
    if (input.contracts.length === 0) continue;
    const closed = all.filter((r) => r.employeeId === e.id && r.kind === "entry" && r.end);
    const intervals = shiftsToIntervals(
      closed.map((r) => ({
        id: r.entryId!,
        start: r.start,
        end: r.end!,
        breaks: engineBreaks(r.breaks),
      })),
    ).map((i, k) => ({
      ...i,
      kind: closed[k]!.workKind,
      plannedShiftId: closed[k]!.plan ? closed[k]!.shiftId : null,
    }));
    const planned = closed.flatMap((r) =>
      r.plan && r.shiftId ? [{ id: r.shiftId, start: r.plan.start, end: r.plan.end }] : [],
    );
    try {
      for (const s of roundRegistrations({ ...input, worked: intervals, planned }))
        settledById.set(s.id, { start: s.start, end: s.end });
      daily[e.id] = dailyWorkingMinutes({ ...input, intervals });
      const { violations } = validateSchedule({
        ...input,
        intervals,
        from: opts.from,
        to: opts.to,
        context: "time",
      });
      for (const v of violations)
        for (const id of v.intervalIds)
          violationsById.set(id, [...(violationsById.get(id) ?? []), v]);
    } catch {
      // No agreement in force for part of the period: show the raw registrations.
    }
  }

  const rows = all
    .filter((r) => r.date >= opts.from)
    .map((r) => ({
      ...r,
      settled: r.entryId ? (settledById.get(r.entryId) ?? null) : null,
      // Remarks are for the approver; the employee's own view shows only rule breaches.
      violations: r.entryId
        ? (violationsById.get(r.entryId) ?? []).filter(
            (v) => !opts.onlyMine || v.primitive !== "remark",
          )
        : [],
    }));
  return { rows, daily, exempt };
}
