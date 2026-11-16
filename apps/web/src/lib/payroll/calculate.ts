import { resolvePostings, type PostingAllocation, type PostingValues } from "@/lib/domain/posting";
import "server-only";
import {
  ENGINE_VERSION,
  calculatePay,
  shiftsToIntervals,
  type PayResult,
  type ShiftSupplementInput,
  type WorkIntervalInput,
} from "@vagtplan/rules-engine";
import type { createClient } from "@/lib/supabase/server";
import type { AppContext } from "@/lib/auth";
import { addDays, type IsoDate } from "@/lib/domain/civil-date";
import { zonedTime } from "@/lib/domain/schedule-time";
import type { DbBreak } from "@/lib/domain/breaks";
import { engineInputs } from "@/lib/absence/load";
import { loadExpensePayLines } from "./expense-lines";

type Client = Awaited<ReturnType<typeof createClient>>;

/** Norm periods (weeks) at the edges need time around the pay period. */
const MARGIN_DAYS = 14;

const engineBreaks = (b: DbBreak[]) =>
  b.map((x) => ({ start: x.start_at, minutes: x.minutes, paid: x.paid }));

type SupplementRow = {
  id: string;
  name: string;
  pay_code: string;
  amount_type: string;
  amount: number;
};
function supplementInput(t: SupplementRow): ShiftSupplementInput {
  const amount: ShiftSupplementInput["amount"] =
    t.amount_type === "per_hour"
      ? { type: "ore_per_hour", ore: t.amount }
      : t.amount_type === "percent"
        ? { type: "percent_of_base", bp: t.amount }
        : { type: "fixed", ore: t.amount };
  return {
    id: t.id,
    label: t.name,
    payCode: t.pay_code,
    amount,
    source: "Virksomhedens vagttillæg",
  };
}

/**
 * Calculates one employee for a pay period from approved time, the planned
 * shifts behind it (rounding, guarantees, supplements) and approved absence.
 */
export async function calculateEmployee(
  supabase: Client,
  ctx: AppContext,
  period: { start: IsoDate; end: IsoDate },
  employeeId: string,
  /** Preview: also count registrations waiting for approval (never for pay runs). */
  opts: { includePending?: boolean } = {},
): Promise<{ result: PayResult; pending: number } | null> {
  const input = (await engineInputs(supabase, ctx, [employeeId])).get(employeeId);
  if (!input || input.contracts.length === 0) return null;
  const from = new Date(zonedTime(addDays(period.start, -MARGIN_DAYS))).toISOString();
  const to = new Date(zonedTime(addDays(period.end, MARGIN_DAYS + 1))).toISOString();

  const [{ data: entries }, { data: absences }, { data: supplementTypes }] = await Promise.all([
    supabase
      .from("time_entry")
      .select(
        "id, shift_id, department_id, start_at, end_at, breaks, kind, status, posting_allocations, supplement_type_ids",
      )
      .eq("employee_id", employeeId)
      .is("superseded_at", null)
      .is("archived_at", null)
      .gte("start_at", from)
      .lt("start_at", to),
    supabase
      .from("absence")
      .select("id, type_code, from_date, to_date")
      .eq("employee_id", employeeId)
      .eq("status", "approved")
      .lte("from_date", period.end)
      .gte("to_date", period.start),
    supabase
      .from("supplement_type")
      .select("id, name, pay_code, amount_type, amount")
      .eq("organization_id", ctx.organization.id),
  ]);
  const approved = (entries ?? []).filter(
    (e) => e.end_at && (e.status === "approved" || (opts.includePending && e.status === "pending")),
  );
  const pending = (entries ?? []).filter(
    (e) =>
      e.status !== "approved" &&
      new Date(e.start_at) >= new Date(zonedTime(period.start)) &&
      new Date(e.start_at) < new Date(zonedTime(addDays(period.end, 1))),
  ).length;

  // The published plan behind the registrations.
  const shiftIds = [...new Set(approved.flatMap((e) => (e.shift_id ? [e.shift_id] : [])))];
  const { data: shifts } = shiftIds.length
    ? await supabase.from("shift").select("id, published").in("id", shiftIds)
    : { data: [] };
  const supplementById = new Map((supplementTypes ?? []).map((t) => [t.id, supplementInput(t)]));
  // Posting defaults: the department, then the employee (most specific wins).
  const departmentIds = [...new Set(approved.map((e) => e.department_id))];
  const [{ data: employeeRow }, { data: departments }] = await Promise.all([
    supabase.from("employee").select("posting_defaults").eq("id", employeeId).maybeSingle(),
    departmentIds.length
      ? supabase.from("department").select("id, posting_defaults").in("id", departmentIds)
      : Promise.resolve({ data: [] as { id: string; posting_defaults: unknown }[] }),
  ]);
  const employeeDefaults = (employeeRow?.posting_defaults ?? {}) as PostingValues;
  const departmentDefaults = new Map(
    (departments ?? []).map((d) => [d.id, (d.posting_defaults ?? {}) as PostingValues]),
  );
  type Snapshot = {
    start_at: string;
    end_at: string;
    breaks?: DbBreak[];
    kind?: "work" | "on_call";
    supplement_type_ids?: string[];
  };
  const plan = new Map(
    (shifts ?? []).flatMap((s) =>
      s.published ? [[s.id, s.published as unknown as Snapshot]] : [],
    ),
  );

  const worked: WorkIntervalInput[] = shiftsToIntervals(
    approved.map((e) => ({
      id: e.id,
      start: e.start_at,
      end: e.end_at!,
      breaks: engineBreaks((e.breaks ?? []) as unknown as DbBreak[]),
    })),
  ).map((i, k) => {
    const e = approved[k]!;
    const p = e.shift_id ? plan.get(e.shift_id) : undefined;
    return {
      ...i,
      kind: e.kind,
      plannedShiftId: p ? e.shift_id : null,
      postings: resolvePostings(
        departmentDefaults.get(e.department_id) ?? {},
        employeeDefaults,
        (e.posting_allocations ?? []) as unknown as PostingAllocation[],
      ),
      // The plan's supplements and those added to the registration (once each).
      supplements: [
        ...new Set([...(p?.supplement_type_ids ?? []), ...(e.supplement_type_ids ?? [])]),
      ].flatMap((id) => {
        const s = supplementById.get(id);
        return s ? [s] : [];
      }),
    };
  });
  const planned: WorkIntervalInput[] = shiftsToIntervals(
    [...plan.entries()].map(([id, p]) => ({
      id,
      start: p.start_at,
      end: p.end_at,
      breaks: engineBreaks(p.breaks ?? []),
      kind: p.kind ?? "work",
    })),
  );

  const result = calculatePay({
    ...input,
    period: { from: period.start, to: period.end },
    worked,
    planned,
    absences: (absences ?? []).map((a) => ({
      id: a.id,
      type: a.type_code,
      from: a.from_date,
      to: a.to_date,
    })),
  });
  return { result, pending };
}

/** Calculates and saves a new pay run (the previous run is superseded). */
export async function calculateAndSave(
  supabase: Client,
  ctx: AppContext,
  period: { id: string; start: IsoDate; end: IsoDate },
  employeeId: string,
): Promise<string | null> {
  const calc = await calculateEmployee(supabase, ctx, period, employeeId);
  if (!calc) return null;
  // Mileage and expenses are paid with the period (not working time; not in the engine).
  const extra = await loadExpensePayLines(supabase, ctx, period, employeeId);
  const lines = [...calc.result.lines, ...extra.lines];
  const { error } = await supabase.rpc("save_pay_run", {
    p_period_id: period.id,
    p_employee_id: employeeId,
    p_engine_version: ENGINE_VERSION,
    p_notes: [...calc.result.notes, ...extra.notes],
    p_daily: calc.result.dailyMinutes,
    p_pending: calc.pending,
    p_lines: lines.map((l) => ({
      pay_code: l.payCode,
      label: l.label,
      unit: l.unit,
      quantity_minutes: l.quantityMinutes,
      rate_ore: l.rateOre,
      amount_ore: l.amountOre,
      explanation: l.explanation,
      posting: l.posting,
    })),
  });
  return error ? error.message : null;
}
