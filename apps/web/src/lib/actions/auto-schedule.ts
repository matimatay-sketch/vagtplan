"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { canInDepartment } from "@/lib/permissions";
import { addDays, isValidIsoDate } from "@/lib/domain/civil-date";
import { localParts, weekDates, weekStartOf, zonedTime } from "@/lib/domain/schedule-time";
import { autoSchedule, type PlanEmployee, type PlannedShift } from "@/lib/domain/auto-schedule";
import { unpaidMinutes, type TemplateBreak } from "@/lib/domain/breaks";
import { formBreaksToDb, localInstants } from "@/lib/schedule/breaks";
import { archiveShifts, blockingFor } from "@/lib/schedule/proposals";
import { formatHours } from "@/lib/domain/numbers";
import type { Json } from "@/lib/supabase/database.types";
import { da } from "@/lib/i18n/da";
import { departmentUsesWishes } from "@/lib/schedule/wishes";

const t = da.autoSchedule;
/** Rounds of "plan → check the rules → plan around what was turned down". */
const ROUNDS = 4;

const input = z.object({
  departmentId: z.guid(),
  weekStart: z.string().refine(isValidIsoDate),
  templateIds: z.array(z.guid()).min(1).max(50),
  days: z.array(z.string().refine(isValidIsoDate)).min(1).max(7),
});

export type AutoScheduleResult =
  | {
      ok: true;
      created: number;
      dropped: number;
      summary: { name: string; planned: string; target: string | null }[];
    }
  | { ok: false; message: string };

/**
 * The built-in proposal: the chosen templates are spread over the chosen days
 * by the employees' norms, saved as draft shifts on a proposal and checked by
 * the rules engine. Shifts that break a blocking rule are planned again around.
 */
export async function autoScheduleAction(raw: z.input<typeof input>): Promise<AutoScheduleResult> {
  const ctx = await requireContext(["schedule.manage"]);
  const p = input.safeParse(raw);
  if (!p.success) return { ok: false, message: t.chooseTemplates };
  const { departmentId, templateIds } = p.data;
  if (
    !canInDepartment(ctx.permissions, "schedule.manage", departmentId, ctx.responsibleDepartmentIds)
  )
    return { ok: false, message: da.common.notAllowed };
  const weekStart = weekStartOf(p.data.weekStart);
  const dates = weekDates(weekStart);
  const days = dates.filter((d) => p.data.days.includes(d));
  if (days.length === 0) return { ok: false, message: t.chooseDays };
  const supabase = await createClient();
  const from = new Date(zonedTime(weekStart)).toISOString();
  const to = new Date(zonedTime(addDays(weekStart, 7))).toISOString();

  const [{ data: members }, { data: templates }] = await Promise.all([
    supabase
      .from("employee_department")
      .select(
        "employee:employee!employee_department_organization_id_employee_id_fkey (id, first_name, last_name, archived_at, contract (valid_from, valid_to, weekly_norm_minutes))",
      )
      .eq("department_id", departmentId),
    supabase
      .from("shift_template")
      .select(
        "id, name, start_time, end_time, breaks, kind, label, supplement_type_ids, department_id",
      )
      .eq("organization_id", ctx.organization.id)
      .is("archived_at", null)
      .in("id", templateIds)
      .or(`department_id.is.null,department_id.eq.${departmentId}`),
  ]);
  if (!templates?.length) return { ok: false, message: t.chooseTemplates };
  const employees = (members ?? []).flatMap((m) =>
    m.employee && !m.employee.archived_at ? [m.employee] : [],
  );
  const ids = employees.map((e) => e.id);
  const none = ["00000000-0000-0000-0000-000000000000"];
  const usesWishes = await departmentUsesWishes(supabase, ctx.organization.id, departmentId);
  const [{ data: existing }, { data: availability }, { data: absences }] = await Promise.all([
    // All the employees' shifts in the week, in any department: they count toward the norm.
    supabase
      .from("shift")
      .select("employee_id, start_at, end_at, breaks")
      .in("employee_id", ids.length ? ids : none)
      .is("archived_at", null)
      .gte("start_at", from)
      .lt("start_at", to),
    usesWishes
      ? supabase
          .from("availability")
          .select("employee_id, date, kind, from_time, to_time")
          .in("employee_id", ids.length ? ids : none)
          .is("archived_at", null)
          .gte("date", weekStart)
          .lte("date", dates[6]!)
      : Promise.resolve({ data: [] as never[] }),
    supabase
      .from("absence")
      .select("employee_id, from_date, to_date")
      .in("employee_id", ids.length ? ids : none)
      .in("status", ["approved", "requested"])
      .lte("from_date", dates[6]!)
      .gte("to_date", weekStart),
  ]);

  const minutesOf = (s: { start_at: string; end_at: string; breaks: unknown }) =>
    (Date.parse(s.end_at) - Date.parse(s.start_at)) / 60_000 -
    unpaidMinutes((s.breaks ?? []) as { minutes: number; paid: boolean }[]);
  const planEmployees: PlanEmployee[] = employees.map((e) => {
    const contract = e.contract.find(
      (c) => c.valid_from <= dates[6]! && (c.valid_to === null || c.valid_to >= weekStart),
    );
    const own = (existing ?? []).filter((s) => s.employee_id === e.id);
    const avail = (availability ?? []).filter((a) => a.employee_id === e.id);
    const absent = (absences ?? [])
      .filter((a) => a.employee_id === e.id)
      .flatMap((a) => dates.filter((d) => d >= a.from_date && d <= a.to_date));
    return {
      id: e.id,
      name: `${e.first_name} ${e.last_name}`,
      targetMinutes: contract?.weekly_norm_minutes ?? null,
      alreadyMinutes: Math.round(own.reduce((sum, s) => sum + minutesOf(s), 0)),
      busyDates: [
        ...own.map((s) => localParts(s.start_at).date),
        ...absent,
        ...avail.filter((a) => a.kind === "unavailable" && !a.from_time).map((a) => a.date),
      ],
      unavailable: avail
        .filter((a) => a.kind === "unavailable" && a.from_time && a.to_time)
        .map((a) => ({ date: a.date, from: a.from_time!.slice(0, 5), to: a.to_time!.slice(0, 5) })),
      preferredDates: avail.filter((a) => a.kind === "available").map((a) => a.date),
    };
  });
  const byId = new Map(templates.map((tpl) => [tpl.id, tpl]));
  const planTemplates = templates.map((tpl) => {
    const s = Number(tpl.start_time.slice(0, 2)) * 60 + Number(tpl.start_time.slice(3, 5));
    let e = Number(tpl.end_time.slice(0, 2)) * 60 + Number(tpl.end_time.slice(3, 5));
    if (e <= s) e += 1440;
    return {
      id: tpl.id,
      name: tpl.name,
      start: tpl.start_time.slice(0, 5),
      end: tpl.end_time.slice(0, 5),
      paidMinutes: e - s - unpaidMinutes((tpl.breaks ?? []) as TemplateBreak[]),
    };
  });

  const { data: proposal, error } = await supabase
    .from("assistant_proposal")
    .insert({
      organization_id: ctx.organization.id,
      department_id: departmentId,
      week_start: weekStart,
      source: "auto",
    })
    .select("id")
    .single();
  if (error || !proposal) return { ok: false, message: da.common.notAllowed };

  const insert = async (shifts: PlannedShift[]) => {
    if (shifts.length === 0) return [] as { id: string; key: string }[];
    const rows = shifts.map((s) => {
      const tpl = byId.get(s.templateId)!;
      const breaks = ((tpl.breaks ?? []) as TemplateBreak[]).map((b) => {
        const start = b.start_time?.slice(0, 5) ?? "";
        return { start, minutes: b.minutes, paid: b.paid, nextDay: !!start && start < s.start };
      });
      return {
        organization_id: ctx.organization.id,
        department_id: departmentId,
        employee_id: s.employeeId,
        template_id: tpl.id,
        ...localInstants(s.date, s.start, s.end, s.endsNextDay),
        breaks: formBreaksToDb(breaks, s.date) as unknown as NonNullable<Json>,
        kind: tpl.kind,
        label: tpl.label,
        supplement_type_ids: tpl.supplement_type_ids,
        proposal_id: proposal.id,
      };
    });
    const { data, error: e } = await supabase.from("shift").insert(rows).select("id");
    if (e) throw new Error(e.message);
    return (data ?? []).map((r, i) => ({
      id: r.id,
      key: `${shifts[i]!.employeeId}|${shifts[i]!.date}|${shifts[i]!.templateId}`,
    }));
  };

  try {
    const forbidden: string[] = [];
    let plan = autoSchedule({ dates: days, templates: planTemplates, employees: planEmployees });
    let saved = await insert(plan.shifts);
    let dropped = 0;
    for (let round = 1; round <= ROUNDS; round++) {
      const blocking = await blockingFor(
        supabase,
        ctx,
        ids,
        weekStart,
        saved.map((x) => x.id),
      );
      if (blocking.length === 0) break;
      const bad = new Set(blocking.flatMap((v) => v.intervalIds));
      const turnedDown = saved.filter((x) => bad.has(x.id));
      forbidden.push(...turnedDown.map((x) => x.key));
      await archiveShifts(
        supabase,
        saved.map((x) => x.id),
      );
      if (round === ROUNDS) {
        // Last round: keep what passes and leave the rest out.
        const keep = plan.shifts.filter(
          (s) => !forbidden.includes(`${s.employeeId}|${s.date}|${s.templateId}`),
        );
        dropped = plan.shifts.length - keep.length;
        saved = await insert(keep);
        break;
      }
      plan = autoSchedule({
        dates: days,
        templates: planTemplates,
        employees: planEmployees,
        forbidden,
      });
      saved = await insert(plan.shifts);
    }
    const minutes = new Map<string, number>(planEmployees.map((e) => [e.id, e.alreadyMinutes]));
    for (const s of plan.shifts)
      if (saved.some((x) => x.key === `${s.employeeId}|${s.date}|${s.templateId}`))
        minutes.set(
          s.employeeId,
          (minutes.get(s.employeeId) ?? 0) +
            planTemplates.find((x) => x.id === s.templateId)!.paidMinutes,
        );
    const summary = planEmployees.map((e) => ({
      name: e.name,
      planned: formatHours(minutes.get(e.id) ?? 0),
      target: e.targetMinutes === null ? null : formatHours(e.targetMinutes),
    }));
    await supabase
      .from("assistant_proposal")
      .update({
        note: summary
          .map((x) => (x.target ? t.noteLine(x.name, x.planned, x.target) : t.noteNoNorm(x.name)))
          .join("\n")
          .slice(0, 2000),
      })
      .eq("id", proposal.id);
    revalidatePath("/vagtplan", "layout");
    return { ok: true, created: saved.length, dropped, summary };
  } catch {
    return { ok: false, message: da.common.unknownError };
  }
}
