"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  addDays as engineAddDays,
  formatInstant,
  parseInstant,
  toLocal,
  wallTime,
} from "@vagtplan/rules-engine";
import { requireContext } from "@/lib/auth";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { fieldErrors } from "@/lib/forms/schemas";
import { shiftFormSchema, templateFormSchema } from "@/lib/forms/schedule";
import { isValidIsoDate } from "@/lib/domain/civil-date";
import { zonedTime } from "@/lib/domain/schedule-time";
import {
  validateWeek,
  violationKey,
  type EmployeeViolation,
  type NoticeShift,
} from "@/lib/schedule/validate-week";
import { da } from "@/lib/i18n/da";
import { formBreaksToDb, moveDbBreaks, type DbBreak } from "@/lib/schedule/breaks";
import { PERMANENT_OVERRIDE_REASON } from "@/lib/schedule/rule-handling";
import type { Json } from "@/lib/supabase/database.types";
import { dbErrorMessage, formValues, type ActionState } from "./state";

const TZ = "Europe/Copenhagen";
const asJson = (v: unknown) => v as NonNullable<Json>;
const isoDate = z.string().refine(isValidIsoDate);

const hhmm = (minuteOfDay: number) =>
  `${String(Math.floor(minuteOfDay / 60)).padStart(2, "0")}:${String(minuteOfDay % 60).padStart(2, "0")}`;

/** Start/end instants for a local date and wall-clock times (DST-safe). */
function instants(date: string, start: string, end: string, endsNextDay: boolean) {
  const s = wallTime(date, start, TZ);
  const e = wallTime(endsNextDay ? engineAddDays(date, 1) : date, end, TZ);
  return { start_at: formatInstant(s), end_at: formatInstant(e) };
}

function revalidateSchedule() {
  revalidatePath("/vagtplan", "layout");
  revalidatePath("/min-vagtplan", "layout");
}

// ---------------------------------------------------------------------------
// Create / edit / remove
// ---------------------------------------------------------------------------
export async function saveShiftAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireContext(["schedule.manage"]);
  const values = formValues(formData);
  const parsed = shiftFormSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  const f = parsed.data;
  const row = {
    department_id: f.department_id,
    employee_id: f.employee_id,
    ...instants(f.date, f.start_time, f.end_time, f.endsNextDay),
    breaks: asJson(formBreaksToDb(f.breaks, f.date)),
    supplement_type_ids: f.supplement_type_ids,
    label: f.label,
    kind: f.kind,
    template_id: f.template_id,
  };
  const supabase = await createClient();
  const { data, error } = f.id
    ? await supabase.from("shift").update(row).eq("id", f.id).select("id")
    : await supabase
        .from("shift")
        .insert({ ...row, organization_id: ctx.organization.id })
        .select("id");
  if (error) return { message: dbErrorMessage(error), values };
  if (!data?.length) return { message: da.common.notAllowed, values };
  revalidateSchedule();
  return { ok: true, message: da.common.saved };
}

export async function removeShiftAction(id: string): Promise<ActionState> {
  await requireContext(["schedule.manage"]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shift")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", z.guid().parse(id))
    .select("id");
  if (error) return { message: dbErrorMessage(error) };
  if (!data?.length) return { message: da.common.notAllowed };
  revalidateSchedule();
  return { ok: true };
}

/** Moves (or copies) a shift to another employee/date, keeping its local wall-clock times. */
export async function moveShiftAction(input: {
  id: string;
  employeeId: string | null;
  date: string;
  copy: boolean;
}): Promise<ActionState> {
  const ctx = await requireContext(["schedule.manage"]);
  const p = z
    .object({ id: z.guid(), employeeId: z.guid().nullable(), date: isoDate, copy: z.boolean() })
    .parse(input);
  const supabase = await createClient();
  const { data: s } = await supabase
    .from("shift")
    .select(
      "department_id, start_at, end_at, breaks, supplement_type_ids, label, kind, template_id",
    )
    .eq("id", p.id)
    .maybeSingle();
  if (!s) return { message: da.common.notAllowed };
  const start = toLocal(parseInstant(s.start_at), TZ);
  const end = toLocal(parseInstant(s.end_at), TZ);
  const dayShift = (Date.parse(end.date) - Date.parse(start.date)) / 86_400_000;
  const row = {
    employee_id: p.employeeId,
    start_at: formatInstant(wallTime(p.date, hhmm(start.minuteOfDay), TZ)),
    end_at: formatInstant(wallTime(engineAddDays(p.date, dayShift), hhmm(end.minuteOfDay), TZ)),
    breaks: asJson(moveDbBreaks(s.breaks as unknown as DbBreak[], start.date, p.date)),
  };
  const { error } = p.copy
    ? await supabase.from("shift").insert({
        ...row,
        organization_id: ctx.organization.id,
        department_id: s.department_id,
        supplement_type_ids: s.supplement_type_ids,
        label: s.label,
        kind: s.kind,
        template_id: s.template_id,
      })
    : await supabase.from("shift").update(row).eq("id", p.id);
  if (error) return { message: dbErrorMessage(error) };
  revalidateSchedule();
  return { ok: true };
}

/** Day view: new start/end as minutes from local midnight of `date` (end may exceed 1440). */
export async function resizeShiftAction(input: {
  id: string;
  date: string;
  startMinute: number;
  endMinute: number;
}): Promise<ActionState> {
  await requireContext(["schedule.manage"]);
  const p = z
    .object({
      id: z.guid(),
      date: isoDate,
      startMinute: z.number().int().min(0).max(1439),
      endMinute: z.number().int().min(15).max(2880),
    })
    .refine((x) => x.endMinute > x.startMinute && x.endMinute - x.startMinute <= 1440)
    .parse(input);
  const endDate = p.endMinute >= 1440 ? engineAddDays(p.date, 1) : p.date;
  const supabase = await createClient();
  const { data: s } = await supabase.from("shift").select("breaks").eq("id", p.id).maybeSingle();
  if (!s) return { message: da.common.notAllowed };
  const newStart = wallTime(p.date, hhmm(p.startMinute), TZ);
  const newEnd = wallTime(endDate, hhmm(p.endMinute % 1440), TZ);
  // Keep placed breaks that still fit; keep unplaced breaks while they fit in total.
  let budget = p.endMinute - p.startMinute - 1;
  const breaks = (s.breaks as unknown as DbBreak[]).filter((b) => {
    if (b.start_at) {
      const at = parseInstant(b.start_at);
      if (at < newStart || at + b.minutes * 60_000 > newEnd) return false;
    }
    if (b.minutes > budget) return false;
    budget -= b.minutes;
    return true;
  });
  const { error } = await supabase
    .from("shift")
    .update({
      start_at: formatInstant(newStart),
      end_at: formatInstant(newEnd),
      breaks: asJson(breaks),
    })
    .eq("id", p.id);
  if (error) return { message: dbErrorMessage(error) };
  revalidateSchedule();
  return { ok: true };
}

export async function copyPreviousWeekAction(input: {
  departmentId: string;
  weekStart: string;
}): Promise<ActionState> {
  const ctx = await requireContext(["schedule.manage"]);
  const p = z.object({ departmentId: z.guid(), weekStart: isoDate }).parse(input);
  const prev = engineAddDays(p.weekStart, -7);
  const supabase = await createClient();
  const { data: shifts, error } = await supabase
    .from("shift")
    .select("employee_id, start_at, end_at, breaks, supplement_type_ids, label, kind, template_id")
    .eq("department_id", p.departmentId)
    .is("archived_at", null)
    .gte("start_at", new Date(zonedTime(prev)).toISOString())
    .lt("start_at", new Date(zonedTime(p.weekStart)).toISOString());
  if (error) return { message: dbErrorMessage(error) };
  if (!shifts?.length) return { message: da.schedule.nothingToCopy };
  const rows = shifts.map((s) => {
    const start = toLocal(parseInstant(s.start_at), TZ);
    const end = toLocal(parseInstant(s.end_at), TZ);
    return {
      organization_id: ctx.organization.id,
      department_id: p.departmentId,
      employee_id: s.employee_id,
      start_at: formatInstant(wallTime(engineAddDays(start.date, 7), hhmm(start.minuteOfDay), TZ)),
      end_at: formatInstant(wallTime(engineAddDays(end.date, 7), hhmm(end.minuteOfDay), TZ)),
      breaks: asJson(
        moveDbBreaks(s.breaks as unknown as DbBreak[], start.date, engineAddDays(start.date, 7)),
      ),
      supplement_type_ids: s.supplement_type_ids,
      label: s.label,
      kind: s.kind,
      template_id: s.template_id,
    };
  });
  const { error: insError } = await supabase.from("shift").insert(rows);
  if (insError) return { message: dbErrorMessage(insError) };
  revalidateSchedule();
  return { ok: true, message: da.schedule.copied(rows.length) };
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------
export async function createTemplateAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireContext(["schedule.manage"]);
  const values = formValues(formData);
  const parsed = templateFormSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  const supabase = await createClient();
  const { error } = await supabase.from("shift_template").insert({
    ...parsed.data,
    breaks: asJson(
      parsed.data.breaks.map((b) => ({ start_time: b.start, minutes: b.minutes, paid: b.paid })),
    ),
    organization_id: ctx.organization.id,
  });
  if (error) return { message: dbErrorMessage(error), values };
  revalidatePath("/vagtplan", "layout");
  return { ok: true, message: da.common.saved };
}

export async function archiveTemplateAction(formData: FormData) {
  await requireContext(["schedule.manage"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("shift_template")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", z.guid().parse(formData.get("id")));
  if (error) throw new Error(dbErrorMessage(error));
  revalidatePath("/vagtplan", "layout");
}

// ---------------------------------------------------------------------------
// Publishing
// ---------------------------------------------------------------------------
export type PublishPreview = {
  shiftCount: number;
  violations: (EmployeeViolation & { key: string; employeeName: string })[];
  canOverride: boolean;
};

async function collectPublish(departmentId: string, weekStart: string) {
  const ctx = await requireContext(["schedule.publish"]);
  const supabase = await createClient();
  const [{ data: canPublish }, { data: canOverride }] = await Promise.all([
    supabase.rpc("can_on_department", { perm: "schedule.publish", dept: departmentId }),
    supabase.rpc("can_on_department", { perm: "schedule.override", dept: departmentId }),
  ]);
  if (!canPublish) throw new Error(da.common.notAllowed);
  const from = new Date(zonedTime(weekStart)).toISOString();
  const to = new Date(zonedTime(engineAddDays(weekStart, 7))).toISOString();
  const { data: shifts, error } = await supabase
    .from("shift")
    .select("id, employee_id, start_at, status, published, archived_at")
    .eq("department_id", departmentId)
    .gte("start_at", from)
    .lt("start_at", to);
  if (error) throw error;
  const pending = (shifts ?? []).filter(
    (s) =>
      (s.archived_at === null && s.status === "draft") ||
      (s.archived_at !== null && s.published !== null),
  );
  const notice: NoticeShift[] = pending.flatMap((s) => {
    const snap = s.published as { employee_id?: string; start_at?: string } | null;
    const employeeId = s.employee_id ?? snap?.employee_id;
    if (!employeeId) return [];
    const change: NoticeShift["change"] = s.archived_at ? "removed" : snap ? "changed" : "new";
    return [
      {
        shiftId: s.id,
        employeeId,
        start: change === "removed" ? (snap?.start_at ?? s.start_at) : s.start_at,
        change,
      },
    ];
  });
  const employeeIds = [
    ...new Set(
      (shifts ?? [])
        .filter((s) => s.archived_at === null && s.employee_id)
        .map((s) => s.employee_id!),
    ),
  ];
  const violations = await validateWeek(supabase, {
    organizationId: ctx.organization.id,
    employeeIds,
    weekStart,
    timezone: ctx.organization.timezone,
    noticeFor: notice,
  });
  const { data: names } = await supabase
    .from("employee")
    .select("id, first_name, last_name")
    .in("id", employeeIds);
  const nameOf = new Map((names ?? []).map((n) => [n.id, `${n.first_name} ${n.last_name}`]));
  return {
    ctx,
    from,
    to,
    pendingCount: pending.length,
    canOverride: Boolean(canOverride),
    violations: violations.map((v) => ({
      ...v,
      key: violationKey(v),
      employeeName: nameOf.get(v.employeeId) ?? "",
    })),
  };
}

export async function previewPublishAction(input: {
  departmentId: string;
  weekStart: string;
}): Promise<PublishPreview> {
  const p = z.object({ departmentId: z.guid(), weekStart: isoDate }).parse(input);
  const r = await collectPublish(p.departmentId, p.weekStart);
  return { shiftCount: r.pendingCount, violations: r.violations, canOverride: r.canOverride };
}

/** Re-validates on the server; the client only supplies override reasons by violation key. */
export async function publishAction(input: {
  departmentId: string;
  weekStart: string;
  overrides: Record<string, string>;
}): Promise<ActionState> {
  const p = z
    .object({
      departmentId: z.guid(),
      weekStart: isoDate,
      overrides: z.record(z.string(), z.string().max(500)),
    })
    .parse(input);
  const r = await collectPublish(p.departmentId, p.weekStart);
  // The organization's rule handling decides what needs a reason ("block")
  // and what is permanently overridden ("allow"). Everything is recorded.
  const needsReason = r.violations.filter((v) => v.handling === "block");
  if (needsReason.length && !r.canOverride) return { message: da.schedule.overrideNotAllowed };
  if (needsReason.some((v) => (p.overrides[v.key] ?? "").trim().length < 5))
    return { message: da.schedule.overrideMissing };

  const service = createServiceClient();
  const { error } = await service.rpc("publish_schedule", {
    p_actor: r.ctx.userId,
    p_department_id: p.departmentId,
    p_from: r.from,
    p_to: r.to,
    p_from_date: p.weekStart,
    p_to_date: engineAddDays(p.weekStart, 6),
    p_violations: r.violations.map((v) => ({
      shift_id: v.intervalIds.length === 1 ? v.intervalIds[0] : null,
      employee_id: v.employeeId,
      rule_id: v.ruleId,
      code: v.code,
      severity: v.handling === "block" || v.severity === "BLOCKING" ? "BLOCKING" : "WARNING",
      message: v.message,
      date: v.date,
      details: { ...v.details, intervalIds: v.intervalIds, engineSeverity: v.severity },
      source: v.source,
      auto_override: v.handling === "allow" && v.severity === "BLOCKING",
      override_reason:
        v.handling === "block"
          ? p.overrides[v.key]!.trim()
          : v.severity === "BLOCKING"
            ? PERMANENT_OVERRIDE_REASON
            : null,
    })),
  });
  if (error) return { message: dbErrorMessage(error) };
  revalidateSchedule();
  return { ok: true, message: da.schedule.published(r.pendingCount) };
}
