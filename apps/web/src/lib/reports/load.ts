import "server-only";
import type { AppContext } from "@/lib/auth";
import type { createClient } from "@/lib/supabase/server";
import type { DbBreak } from "@/lib/domain/breaks";
import { addDays } from "@/lib/domain/civil-date";
import { localParts, zonedTime } from "@/lib/domain/schedule-time";
import { loadPeriodAbsences } from "@/lib/absence/load";
import {
  absenceReport,
  employeesReport,
  normMinutes,
  normReport,
  shiftsReport,
  timeReport,
  type ReportKind,
  type ReportTable,
} from "@/lib/domain/reports";
import { da } from "@/lib/i18n/da";

type Client = Awaited<ReturnType<typeof createClient>>;
type Query = { report: ReportKind; from: string; to: string; departmentId: string | null };

const t = da.reports;
const minutesBetween = (a: string, b: string) =>
  Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60_000);
const unpaid = (breaks: readonly DbBreak[]) =>
  breaks.filter((b) => !b.paid).reduce((s, b) => s + b.minutes, 0);

/**
 * Registrations in the range the user may see (the time_overview function
 * checks the rights), without the validation the approval page runs.
 */
async function timeEntries(supabase: Client, q: Query) {
  const { data, error } = await supabase.rpc("time_overview", {
    p_from: new Date(zonedTime(q.from)).toISOString(),
    p_to: new Date(zonedTime(addDays(q.to, 1))).toISOString(),
  });
  if (error) throw error;
  return (data ?? [])
    .filter((r) => r.row_kind === "entry" && r.employee_id && r.start_at)
    .filter((r) => !q.departmentId || r.department_id === q.departmentId)
    .map((r) => ({
      employeeId: r.employee_id!,
      employeeName: r.employee_name ?? "",
      employeeNumber: r.employee_number ?? "",
      departmentName: r.department_name ?? "",
      date: localParts(r.start_at!).date,
      start: r.start_at!,
      end: r.end_at,
      breaks: (r.breaks ?? []) as unknown as DbBreak[],
      status: r.status,
      source: r.source,
    }));
}

/** The employees the user may see (RLS), optionally in one department. */
async function employees(supabase: Client, ctx: AppContext, departmentId: string | null) {
  const [{ data: rows }, { data: links }] = await Promise.all([
    supabase
      .from("employee")
      .select(
        "id, employee_number, first_name, last_name, email, phone, birth_date, hired_on, terminated_on",
      )
      .eq("organization_id", ctx.organization.id)
      .is("archived_at", null)
      .order("employee_number"),
    supabase
      .from("employee_department")
      .select(
        "employee_id, department_id, department:department!employee_department_organization_id_department_id_fkey (name)",
      )
      .eq("organization_id", ctx.organization.id),
  ]);
  const departments = new Map<string, { ids: string[]; names: string[] }>();
  for (const l of links ?? []) {
    const d = departments.get(l.employee_id) ?? { ids: [], names: [] };
    d.ids.push(l.department_id);
    if (l.department?.name) d.names.push(l.department.name);
    departments.set(l.employee_id, d);
  }
  return (rows ?? [])
    .filter((e) => !departmentId || departments.get(e.id)?.ids.includes(departmentId))
    .map((e) => ({
      ...e,
      name: `${e.first_name} ${e.last_name}`,
      departments: (departments.get(e.id)?.names ?? []).sort((a, b) => a.localeCompare(b, "da")),
    }));
}

async function contracts(supabase: Client, ids: string[]) {
  if (ids.length === 0) return [];
  const { data } = await supabase
    .from("contract")
    .select(
      "employee_id, valid_from, valid_to, pay_form, weekly_norm_minutes, staff_group, agreement:agreement_id (name)",
    )
    .in("employee_id", ids)
    .order("valid_from");
  return data ?? [];
}

async function shifts(supabase: Client, ctx: AppContext, q: Query) {
  let query = supabase
    .from("shift")
    .select("id, employee_id, department_id, start_at, end_at, breaks, kind, status, published")
    .eq("organization_id", ctx.organization.id)
    .is("archived_at", null)
    .gte("start_at", new Date(zonedTime(q.from)).toISOString())
    .lt("start_at", new Date(zonedTime(addDays(q.to, 1))).toISOString())
    .order("start_at");
  if (q.departmentId) query = query.eq("department_id", q.departmentId);
  const { data } = await query;
  return data ?? [];
}

/** Builds the chosen report from what the user may see. */
export async function loadReport(
  supabase: Client,
  ctx: AppContext,
  q: Query,
): Promise<ReportTable> {
  const status = (s: string | null) => (s ? (t.statuses[s] ?? s) : "");

  if (q.report === "employees") {
    const emps = await employees(supabase, ctx, q.departmentId);
    const cs = await contracts(
      supabase,
      emps.map((e) => e.id),
    );
    // The contract in force on the last day of the range (or the latest one).
    const current = (id: string) => {
      const own = cs.filter((c) => c.employee_id === id);
      return (
        own
          .filter((c) => c.valid_from <= q.to && (c.valid_to === null || c.valid_to >= q.to))
          .at(-1) ?? own.at(-1)
      );
    };
    return employeesReport(
      emps.map((e) => {
        const c = current(e.id);
        return {
          number: e.employee_number,
          name: e.name,
          email: e.email,
          phone: e.phone,
          birthDate: e.birth_date,
          hiredOn: e.hired_on,
          terminatedOn: e.terminated_on,
          departments: e.departments,
          agreement: c?.agreement?.name ?? null,
          payForm: c?.pay_form ?? null,
          weeklyMinutes: c?.weekly_norm_minutes ?? null,
          staffGroup: c?.staff_group ?? null,
        };
      }),
    );
  }

  if (q.report === "time") {
    const entries = await timeEntries(supabase, q);
    return timeReport(
      entries
        .sort(
          (a, b) =>
            a.date.localeCompare(b.date) ||
            a.employeeNumber.localeCompare(b.employeeNumber, "da", { numeric: true }),
        )
        .map((r) => ({
          date: r.date,
          number: r.employeeNumber,
          name: r.employeeName,
          department: r.departmentName,
          start: localParts(r.start).time,
          end: r.end ? localParts(r.end).time : null,
          breakMinutes: unpaid(r.breaks),
          workedMinutes: r.end ? minutesBetween(r.start, r.end) - unpaid(r.breaks) : null,
          status: status(r.status),
          source: r.source ? (t.sources[r.source] ?? r.source) : "",
        })),
    );
  }

  if (q.report === "absence") {
    const emps = await employees(supabase, ctx, q.departmentId);
    const byId = new Map(emps.map((e) => [e.id, e]));
    const { data } = emps.length
      ? await supabase
          .from("absence")
          .select("employee_id, type_code, from_date, to_date, status, days_hundredths")
          .in("employee_id", [...byId.keys()])
          .lte("from_date", q.to)
          .gte("to_date", q.from)
          .order("from_date")
      : { data: [] };
    const { labels } = await loadPeriodAbsences(supabase, ctx, [...byId.keys()], {
      start: q.from,
      end: q.to,
    });
    return absenceReport(
      (data ?? []).flatMap((a) => {
        const e = byId.get(a.employee_id);
        return e
          ? [
              {
                number: e.employee_number,
                name: e.name,
                type: labels[a.type_code] ?? a.type_code,
                from: a.from_date,
                to: a.to_date,
                status: status(a.status),
                daysHundredths: a.days_hundredths,
              },
            ]
          : [];
      }),
    );
  }

  // Planned shifts and norm both need the shifts and the employees.
  const [emps, list, { data: departments }] = await Promise.all([
    employees(supabase, ctx, q.departmentId),
    shifts(supabase, ctx, q),
    supabase.from("department").select("id, name").eq("organization_id", ctx.organization.id),
  ]);
  const empById = new Map(emps.map((e) => [e.id, e]));
  const deptName = new Map((departments ?? []).map((d) => [d.id, d.name]));
  const paidMinutes = (s: { start_at: string; end_at: string; breaks: unknown }) =>
    minutesBetween(s.start_at, s.end_at) - unpaid((s.breaks ?? []) as DbBreak[]);

  if (q.report === "shifts") {
    return shiftsReport(
      list.map((s) => {
        const e = s.employee_id ? empById.get(s.employee_id) : undefined;
        return {
          date: localParts(s.start_at).date,
          number: e?.employee_number ?? "",
          name: e?.name ?? (s.employee_id ? "" : t.openShift),
          department: deptName.get(s.department_id) ?? "",
          start: localParts(s.start_at).time,
          end: localParts(s.end_at).time,
          minutes: paidMinutes(s),
          kind: t.shiftKinds[s.kind] ?? s.kind,
          status: status(s.status === "published" && s.published ? "published" : s.status),
        };
      }),
    );
  }

  // Norm: contracts, planned (work shifts) and registered time per employee.
  const [cs, entries] = await Promise.all([
    contracts(
      supabase,
      emps.map((e) => e.id),
    ),
    timeEntries(supabase, q),
  ]);
  const registered = new Map<string, number>();
  for (const r of entries)
    if (r.end && r.status !== "open")
      registered.set(
        r.employeeId,
        (registered.get(r.employeeId) ?? 0) + minutesBetween(r.start, r.end) - unpaid(r.breaks),
      );
  const planned = new Map<string, number>();
  for (const s of list)
    if (s.employee_id && s.kind === "work")
      planned.set(s.employee_id, (planned.get(s.employee_id) ?? 0) + paidMinutes(s));
  return normReport(
    emps.flatMap((e) => {
      const own = cs.filter((c) => c.employee_id === e.id);
      if (own.length === 0) return [];
      const inForce =
        own
          .filter((c) => c.valid_from <= q.to && (c.valid_to === null || c.valid_to >= q.to))
          .at(-1) ?? own.at(-1)!;
      return [
        {
          number: e.employee_number,
          name: e.name,
          weeklyMinutes: inForce.weekly_norm_minutes,
          normMinutes: normMinutes(
            own.map((c) => ({
              from: c.valid_from,
              to: c.valid_to,
              weeklyMinutes: c.weekly_norm_minutes,
            })),
            { from: q.from, to: q.to },
          ),
          plannedMinutes: planned.get(e.id) ?? 0,
          registeredMinutes: registered.get(e.id) ?? 0,
        },
      ];
    }),
  );
}
