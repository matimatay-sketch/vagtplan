import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { AppContext } from "@/lib/auth";
import { addDays, type IsoDate } from "@/lib/domain/civil-date";
import { ageOn } from "@/lib/domain/age";
import { durationMinutes, zonedTime } from "@/lib/domain/schedule-time";
import { unpaidMinutes, type DbBreak, type TemplateBreak } from "@/lib/domain/breaks";
import { canInDepartment } from "@/lib/permissions";
import { validateWeek } from "./validate-week";

type Client = Awaited<ReturnType<typeof createClient>>;

export type BoardViolation = {
  code: string;
  severity: "BLOCKING" | "WARNING";
  message: string;
  date: IsoDate;
  handling: "block" | "allow";
};

export type BoardSupplementType = {
  id: string;
  name: string;
  amountType: "per_hour" | "fixed" | "percent";
  amount: number;
};

export type BoardShift = {
  id: string;
  employeeId: string | null;
  start: string;
  end: string;
  breaks: DbBreak[];
  supplementTypeIds: string[];
  label: string | null;
  kind: "work" | "on_call";
  templateId: string | null;
  status: "draft" | "published";
  /** Published before, edited since. */
  changed: boolean;
  /** Archived but still published – disappears on next publish. */
  removed: boolean;
  violations: BoardViolation[];
};

export type BoardEmployee = {
  id: string;
  name: string;
  young: boolean;
  weekMinutes: number;
  /** Contract norm for the week (prorated per day), null without contract access. */
  normMinutes: number | null;
  /** Violations not tied to a single shift (weekly rest, averages …). */
  violations: BoardViolation[];
};

export type BoardAvailability = {
  id: string;
  employeeId: string;
  date: IsoDate;
  kind: "unavailable" | "available" | "wish_off" | "wish_work";
  from: string | null;
  to: string | null;
  note: string | null;
};

export type BoardTemplate = {
  id: string;
  name: string;
  start: string;
  end: string;
  breaks: TemplateBreak[];
  supplementTypeIds: string[];
  label: string | null;
  kind: "work" | "on_call";
};

export type WeekBoard = {
  departmentId: string;
  weekStart: IsoDate;
  employees: BoardEmployee[];
  shifts: BoardShift[];
  availability: BoardAvailability[];
  templates: BoardTemplate[];
  supplementTypes: BoardSupplementType[];
  pendingCount: number;
  canManage: boolean;
  canPublish: boolean;
};

export async function loadWeek(
  supabase: Client,
  ctx: AppContext,
  departmentId: string,
  weekStart: IsoDate,
): Promise<WeekBoard> {
  const from = new Date(zonedTime(weekStart)).toISOString();
  const to = new Date(zonedTime(addDays(weekStart, 7))).toISOString();
  const weekEnd = addDays(weekStart, 6);

  const [{ data: members }, { data: shifts }, { data: templates }] = await Promise.all([
    supabase
      .from("employee_department")
      .select(
        "employee:employee!employee_department_organization_id_employee_id_fkey (id, first_name, last_name, birth_date, archived_at)",
      )
      .eq("department_id", departmentId),
    supabase
      .from("shift")
      .select(
        "id, employee_id, start_at, end_at, breaks, supplement_type_ids, label, kind, status, published, archived_at, template_id",
      )
      .eq("department_id", departmentId)
      .lt("start_at", to)
      .gt("end_at", from)
      .order("start_at"),
    supabase
      .from("shift_template")
      .select(
        "id, name, start_time, end_time, breaks, supplement_type_ids, label, kind, department_id",
      )
      .eq("organization_id", ctx.organization.id)
      .is("archived_at", null)
      .or(`department_id.is.null,department_id.eq.${departmentId}`)
      .order("start_time"),
  ]);

  const visibleShifts = (shifts ?? []).filter(
    (s) => s.archived_at === null || s.published !== null,
  );
  const employeeMap = new Map<
    string,
    { id: string; first_name: string; last_name: string; birth_date: string }
  >();
  for (const m of members ?? [])
    if (m.employee && !m.employee.archived_at) employeeMap.set(m.employee.id, m.employee);
  // Employees borrowed from other departments who have shifts here.
  const missing = visibleShifts
    .map((s) => s.employee_id)
    .filter((id): id is string => !!id && !employeeMap.has(id));
  if (missing.length) {
    const { data: extra } = await supabase
      .from("employee")
      .select("id, first_name, last_name, birth_date")
      .in("id", missing);
    for (const e of extra ?? []) employeeMap.set(e.id, e);
  }
  const employeeIds = [...employeeMap.keys()];

  const [{ data: availability }, violations, { data: contracts }, { data: supplementTypes }] =
    await Promise.all([
      supabase
        .from("availability")
        .select("id, employee_id, date, kind, from_time, to_time, note")
        .in(
          "employee_id",
          employeeIds.length ? employeeIds : ["00000000-0000-0000-0000-000000000000"],
        )
        .is("archived_at", null)
        .gte("date", weekStart)
        .lte("date", weekEnd),
      validateWeek(supabase, {
        organizationId: ctx.organization.id,
        employeeIds,
        weekStart,
        timezone: ctx.organization.timezone,
      }),
      supabase
        .from("contract")
        .select("employee_id, valid_from, valid_to, weekly_norm_minutes")
        .in(
          "employee_id",
          employeeIds.length ? employeeIds : ["00000000-0000-0000-0000-000000000000"],
        ),
      supabase
        .from("supplement_type")
        .select("id, name, amount_type, amount")
        .eq("organization_id", ctx.organization.id)
        .is("archived_at", null)
        .order("name"),
    ]);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const normFor = (employeeId: string): number | null => {
    const own = (contracts ?? []).filter((c) => c.employee_id === employeeId);
    if (own.length === 0) return null;
    const total = weekDays.reduce((sum, d) => {
      const c = own.find((x) => x.valid_from <= d && (x.valid_to === null || d <= x.valid_to));
      return sum + (c ? c.weekly_norm_minutes / 7 : 0);
    }, 0);
    return Math.round(total);
  };

  const shiftIds = new Set(visibleShifts.map((s) => s.id));
  const byShift = new Map<string, BoardViolation[]>();
  const byEmployee = new Map<string, BoardViolation[]>();
  for (const v of violations) {
    const bv: BoardViolation = {
      code: v.code,
      severity: v.severity,
      message: v.message,
      date: v.date,
      handling: v.handling,
    };
    const here = v.intervalIds.filter((id) => shiftIds.has(id));
    if (v.intervalIds.length > 0 && here.length === 0) {
      // Caused by shifts in another department: show on the employee.
      byEmployee.set(v.employeeId, [...(byEmployee.get(v.employeeId) ?? []), bv]);
    } else if (here.length > 0) {
      for (const id of here) byShift.set(id, [...(byShift.get(id) ?? []), bv]);
    } else {
      byEmployee.set(v.employeeId, [...(byEmployee.get(v.employeeId) ?? []), bv]);
    }
  }

  const boardShifts: BoardShift[] = visibleShifts.map((s) => ({
    id: s.id,
    employeeId: s.employee_id,
    start: s.start_at,
    end: s.end_at,
    breaks: s.breaks as unknown as DbBreak[],
    supplementTypeIds: s.supplement_type_ids,
    label: s.label,
    kind: s.kind,
    templateId: s.template_id,
    status: s.status,
    changed: s.status === "draft" && s.published !== null && s.archived_at === null,
    removed: s.archived_at !== null,
    violations: byShift.get(s.id) ?? [],
  }));

  const employees: BoardEmployee[] = [...employeeMap.values()]
    .map((e) => ({
      id: e.id,
      name: `${e.first_name} ${e.last_name}`,
      young: ageOn(e.birth_date, weekStart) < 18 || ageOn(e.birth_date, weekEnd) < 18,
      weekMinutes: boardShifts
        .filter((s) => s.employeeId === e.id && !s.removed && s.kind === "work")
        .reduce((sum, s) => sum + durationMinutes(s.start, s.end, unpaidMinutes(s.breaks)), 0),
      normMinutes: normFor(e.id),
      violations: byEmployee.get(e.id) ?? [],
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "da"));

  return {
    departmentId,
    weekStart,
    employees,
    shifts: boardShifts,
    availability: (availability ?? []).map((a) => ({
      id: a.id,
      employeeId: a.employee_id,
      date: a.date,
      kind: a.kind,
      from: a.from_time?.slice(0, 5) ?? null,
      to: a.to_time?.slice(0, 5) ?? null,
      note: a.note,
    })),
    templates: (templates ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      start: t.start_time.slice(0, 5),
      end: t.end_time.slice(0, 5),
      breaks: t.breaks as unknown as TemplateBreak[],
      supplementTypeIds: t.supplement_type_ids,
      label: t.label,
      kind: t.kind,
    })),
    supplementTypes: (supplementTypes ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      amountType: t.amount_type,
      amount: t.amount,
    })),
    pendingCount: (shifts ?? []).filter(
      (s) =>
        (s.archived_at === null && s.status === "draft") ||
        (s.archived_at !== null && s.published !== null),
    ).length,
    canManage: canInDepartment(
      ctx.permissions,
      "schedule.manage",
      departmentId,
      ctx.responsibleDepartmentIds,
    ),
    canPublish: canInDepartment(
      ctx.permissions,
      "schedule.publish",
      departmentId,
      ctx.responsibleDepartmentIds,
    ),
  };
}
