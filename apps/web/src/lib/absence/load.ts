import "server-only";
import {
  leaveAccruals,
  leaveDays,
  leaveTypes,
  mainHolidayStatus,
  type EngineInput,
  type LeavePosting,
} from "@vagtplan/rules-engine";
import type { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import type { AppContext } from "@/lib/auth";
import { todayIn, type IsoDate } from "@/lib/domain/civil-date";
import { balances, planUsage, type Balance, type Posting } from "@/lib/domain/leave";
import {
  EMPLOYEE_ENGINE_SELECT,
  engineInputFor,
  loadAgreements,
  type EmployeeEngineRow,
} from "@/lib/engine";

type Client = Awaited<ReturnType<typeof createClient>>;

export type AbsenceRow = {
  id: string;
  employeeId: string;
  typeCode: string;
  from: IsoDate;
  to: IsoDate;
  status: "requested" | "approved" | "rejected" | "cancelled";
  note: string | null;
  decisionNote: string | null;
  daysHundredths: number | null;
  createdAt: string;
};

export type LeaveType = { code: string; label: string; hasBalance: boolean };

export type EmployeeLeave = {
  employeeId: string;
  types: LeaveType[];
  balances: Balance[];
  /** Hovedferie in the current holiday year (null without a vacation rule). */
  mainHoliday: { from: string; to: string; required: number; longest: number; ok: boolean } | null;
};

/** Can the user see this employee's balances? Checked by the database, not the UI. */
async function canSeeLeave(supabase: Client, ctx: AppContext, employeeId: string) {
  if (ctx.employee?.id === employeeId || ctx.timeApproverOf.includes(employeeId)) return true;
  for (const perm of ["absence.view", "absence.manage", "absence.approve"] as const) {
    const { data } = await supabase.rpc("can_on_employee", { perm, emp: employeeId });
    if (data === true) return true;
  }
  return false;
}

export async function engineInputs(
  supabase: Client,
  ctx: AppContext,
  employeeIds: string[],
): Promise<Map<string, EngineInput>> {
  if (employeeIds.length === 0) return new Map();
  const [agreements, { data }] = await Promise.all([
    loadAgreements(supabase),
    supabase.from("employee").select(EMPLOYEE_ENGINE_SELECT).in("id", employeeIds),
  ]);
  return new Map(
    ((data ?? []) as unknown as EmployeeEngineRow[]).map((e) => [
      e.id,
      engineInputFor(e, agreements, ctx.organization.timezone),
    ]),
  );
}

/**
 * The accrual "job": posts missing accruals (vacation, extra days,
 * entitlements) up to today. Idempotent in the database. Runs through the
 * service role only after the database has confirmed the user's access.
 */
export async function ensureAccruals(
  supabase: Client,
  ctx: AppContext,
  inputs: Map<string, EngineInput>,
): Promise<void> {
  const today = todayIn(ctx.organization.timezone);
  const service = createServiceClient();
  for (const [employeeId, input] of inputs) {
    if (input.contracts.length === 0 || !(await canSeeLeave(supabase, ctx, employeeId))) continue;
    let accruals: LeavePosting[];
    try {
      accruals = leaveAccruals(input, today);
    } catch {
      continue; // Incomplete agreement data: nothing to post.
    }
    const postings = accruals.map((p: LeavePosting) => ({
      account: p.account,
      period_start: p.periodStart,
      usable_until: p.usableUntil,
      hundredths: p.hundredths,
      posted_on: p.date,
      note: p.note,
    }));
    if (postings.length)
      await service.rpc("post_leave_accruals", { p_employee_id: employeeId, p_postings: postings });
  }
}

export async function loadLeave(
  supabase: Client,
  ctx: AppContext,
  employeeIds: string[],
  opts: { absencesFrom: IsoDate },
): Promise<{
  leave: Map<string, EmployeeLeave>;
  absences: AbsenceRow[];
  inputs: Map<string, EngineInput>;
}> {
  const inputs = await engineInputs(supabase, ctx, employeeIds);
  await ensureAccruals(supabase, ctx, inputs);
  const today = todayIn(ctx.organization.timezone);
  const [{ data: postings }, { data: absences }] = await Promise.all([
    supabase
      .from("leave_posting")
      .select("employee_id, account, kind, period_start, usable_until, hundredths")
      .in(
        "employee_id",
        employeeIds.length ? employeeIds : ["00000000-0000-0000-0000-000000000000"],
      ),
    supabase
      .from("absence")
      .select(
        "id, employee_id, type_code, from_date, to_date, status, note, decision_note, days_hundredths, created_at",
      )
      .in(
        "employee_id",
        employeeIds.length ? employeeIds : ["00000000-0000-0000-0000-000000000000"],
      )
      .gte("to_date", opts.absencesFrom)
      .order("from_date"),
  ]);
  const rows: AbsenceRow[] = (absences ?? []).map((a) => ({
    id: a.id,
    employeeId: a.employee_id,
    typeCode: a.type_code,
    from: a.from_date,
    to: a.to_date,
    status: a.status,
    note: a.note,
    decisionNote: a.decision_note,
    daysHundredths: a.days_hundredths,
    createdAt: a.created_at,
  }));

  const leave = new Map<string, EmployeeLeave>();
  for (const id of employeeIds) {
    const input = inputs.get(id);
    const own: Posting[] = (postings ?? [])
      .filter((p) => p.employee_id === id)
      .map((p) => ({
        account: p.account,
        kind: p.kind,
        periodStart: p.period_start,
        usableUntil: p.usable_until,
        hundredths: p.hundredths,
      }));
    let mainHoliday: EmployeeLeave["mainHoliday"] = null;
    let types: LeaveType[] = [];
    try {
      types = input ? leaveTypes(input, today) : [];
    } catch {
      // No agreement version in force today.
    }
    if (input && types.some((t) => t.code === "vacation")) {
      const vacationDates = rows
        .filter(
          (a) =>
            a.employeeId === id &&
            a.typeCode === "vacation" &&
            (a.status === "approved" || a.status === "requested"),
        )
        .flatMap((a) => leaveDays(input, a.from, a.to));
      // The holiday year whose summer is next (or now).
      try {
        mainHoliday = mainHolidayStatus(input, today, vacationDates);
      } catch {
        mainHoliday = null;
      }
    }
    leave.set(id, { employeeId: id, types, balances: balances(own), mainHoliday });
  }
  return { leave, absences: rows, inputs };
}

/**
 * Usage postings for approving an absence: leave days (Monday–Friday without
 * holidays) drawn from the periods that expire first.
 */
export async function usageFor(
  supabase: Client,
  input: EngineInput,
  absence: { employeeId: string; typeCode: string; from: IsoDate; to: IsoDate },
  today: IsoDate,
): Promise<{ account: string; period_start: string; usable_until: string; hundredths: number }[]> {
  const type = leaveTypes(input, absence.from).find((t) => t.code === absence.typeCode);
  if (!type?.hasBalance) return [];
  const days = leaveDays(input, absence.from, absence.to).length * 100;
  if (days === 0) return [];
  const { data } = await supabase
    .from("leave_posting")
    .select("account, kind, period_start, usable_until, hundredths")
    .eq("employee_id", absence.employeeId)
    .eq("account", absence.typeCode);
  const bal = balances(
    (data ?? []).map((p) => ({
      account: p.account,
      kind: p.kind,
      periodStart: p.period_start,
      usableUntil: p.usable_until,
      hundredths: p.hundredths,
    })),
  );
  // Fallback: the latest accrual period that has started on the absence date.
  const accruals = leaveAccruals(input, absence.to > today ? absence.to : today).filter(
    (p) => p.account === absence.typeCode,
  );
  const started = accruals.filter((p) => p.periodStart <= absence.from);
  const f = (started.length ? started : accruals).reduce<LeavePosting | null>(
    (best, p) => (!best || p.periodStart > best.periodStart ? p : best),
    null,
  );
  const fallback = f
    ? { periodStart: f.periodStart, usableUntil: f.usableUntil }
    : { periodStart: absence.from, usableUntil: absence.to };
  return planUsage(bal, days, absence.from, fallback).map((u) => ({
    account: absence.typeCode,
    period_start: u.periodStart,
    usable_until: u.usableUntil,
    hundredths: u.hundredths,
  }));
}
