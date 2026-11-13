"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { addDays as engineAddDays, formatInstant, wallTime } from "@vagtplan/rules-engine";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors } from "@/lib/forms/schemas";
import { rolloutSchema, rotationSchema, slotSchema } from "@/lib/forms/rotation";
import { planRollout, type RolloutAssignment, type RotationSlot } from "@/lib/domain/rotation";
import type { TemplateBreak } from "@/lib/domain/breaks";
import { formBreaksToDb } from "@/lib/schedule/breaks";
import type { Json } from "@/lib/supabase/database.types";
import { da } from "@/lib/i18n/da";
import { dbErrorMessage, formValues, type ActionState } from "./state";

const TZ = "Europe/Copenhagen";
const asJson = (v: unknown) => v as NonNullable<Json>;
type Client = Awaited<ReturnType<typeof createClient>>;

function revalidateRotation(id?: string) {
  revalidatePath("/vagtplan/turnus");
  if (id) revalidatePath(`/vagtplan/turnus/${id}`);
}

export async function createRotationAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireContext(["schedule.manage"]);
  const values = formValues(formData);
  const parsed = rotationSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rotation")
    .insert({ ...parsed.data, organization_id: ctx.organization.id })
    .select("id")
    .single();
  if (error || !data) return { message: dbErrorMessage(error), values };
  await supabase.from("rotation_line").insert({
    organization_id: ctx.organization.id,
    rotation_id: data.id,
    position: 0,
    name: da.turnus.newLineName(1),
  });
  revalidateRotation();
  redirect(`/vagtplan/turnus/${data.id}`);
}

export async function archiveRotationAction(formData: FormData) {
  await requireContext(["schedule.manage"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("rotation")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", z.guid().parse(formData.get("id")));
  if (error) throw new Error(dbErrorMessage(error));
  revalidateRotation();
  redirect("/vagtplan/turnus");
}

// ------------------------------------------------------------------ lines
export async function addLineAction(formData: FormData) {
  const ctx = await requireContext(["schedule.manage"]);
  const rotationId = z.guid().parse(formData.get("rotation_id"));
  const supabase = await createClient();
  const { data: lines } = await supabase
    .from("rotation_line")
    .select("position")
    .eq("rotation_id", rotationId);
  const position = Math.max(-1, ...(lines ?? []).map((l) => l.position)) + 1;
  const { error } = await supabase.from("rotation_line").insert({
    organization_id: ctx.organization.id,
    rotation_id: rotationId,
    position,
    name: da.turnus.newLineName(position + 1),
  });
  if (error) throw new Error(dbErrorMessage(error));
  revalidateRotation(rotationId);
}

export async function renameLineAction(formData: FormData) {
  await requireContext(["schedule.manage"]);
  const p = z
    .object({ id: z.guid(), rotation_id: z.guid(), name: z.string().trim().min(1).max(60) })
    .parse(Object.fromEntries(formData));
  const supabase = await createClient();
  const { error } = await supabase.from("rotation_line").update({ name: p.name }).eq("id", p.id);
  if (error) throw new Error(dbErrorMessage(error));
  revalidateRotation(p.rotation_id);
}

export async function removeLineAction(formData: FormData) {
  await requireContext(["schedule.manage"]);
  const p = z.object({ id: z.guid(), rotation_id: z.guid() }).parse(Object.fromEntries(formData));
  const supabase = await createClient();
  const { error } = await supabase.from("rotation_line").delete().eq("id", p.id);
  if (error) throw new Error(dbErrorMessage(error));
  revalidateRotation(p.rotation_id);
}

// ------------------------------------------------------------------ slots
export async function saveSlotAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireContext(["schedule.manage"]);
  const values = formValues(formData);
  const parsed = slotSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  const { id, breaks, ...rest } = parsed.data;
  const row = {
    ...rest,
    breaks: asJson(breaks.map((b) => ({ start_time: b.start, minutes: b.minutes, paid: b.paid }))),
  };
  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("rotation_slot").update(row).eq("id", id).select("id")
    : await supabase
        .from("rotation_slot")
        .insert({ ...row, organization_id: ctx.organization.id })
        .select("id");
  if (error) return { message: dbErrorMessage(error), values };
  if (!data?.length) return { message: da.common.notAllowed, values };
  revalidateRotation(rest.rotation_id);
  return { ok: true, message: da.common.saved };
}

export async function removeSlotAction(input: {
  id: string;
  rotationId: string;
}): Promise<ActionState> {
  await requireContext(["schedule.manage"]);
  const p = z.object({ id: z.guid(), rotationId: z.guid() }).parse(input);
  const supabase = await createClient();
  const { error } = await supabase.from("rotation_slot").delete().eq("id", p.id);
  if (error) return { message: dbErrorMessage(error) };
  revalidateRotation(p.rotationId);
  return { ok: true };
}

/** Replaces the slots of week `to` with copies of week `from`. */
export async function copyRotationWeekAction(formData: FormData) {
  const ctx = await requireContext(["schedule.manage"]);
  const p = z
    .object({
      rotation_id: z.guid(),
      from: z.coerce.number().int().min(0),
      to: z.coerce.number().int().min(0),
    })
    .parse(Object.fromEntries(formData));
  if (p.from === p.to) return;
  const supabase = await createClient();
  const { data: source, error } = await supabase
    .from("rotation_slot")
    .select(
      "line_id, weekday, start_time, end_time, kind, label, breaks, supplement_type_ids, project_id",
    )
    .eq("rotation_id", p.rotation_id)
    .eq("week_index", p.from);
  if (error) throw new Error(dbErrorMessage(error));
  await supabase
    .from("rotation_slot")
    .delete()
    .eq("rotation_id", p.rotation_id)
    .eq("week_index", p.to);
  if (source?.length) {
    const { error: insError } = await supabase.from("rotation_slot").insert(
      source.map((s) => ({
        ...s,
        breaks: asJson(s.breaks),
        organization_id: ctx.organization.id,
        rotation_id: p.rotation_id,
        week_index: p.to,
      })),
    );
    if (insError) throw new Error(dbErrorMessage(insError));
  }
  revalidateRotation(p.rotation_id);
}

// ------------------------------------------------------------------ rollout
async function loadSlots(supabase: Client, rotationId: string) {
  const [{ data: rotation }, { data: slots }] = await Promise.all([
    supabase
      .from("rotation")
      .select("id, department_id, length_weeks")
      .eq("id", rotationId)
      .maybeSingle(),
    supabase
      .from("rotation_slot")
      .select(
        "id, line_id, week_index, weekday, start_time, end_time, kind, label, breaks, supplement_type_ids, project_id",
      )
      .eq("rotation_id", rotationId),
  ]);
  const mapped: RotationSlot[] = (slots ?? []).map((s) => ({
    id: s.id,
    lineId: s.line_id,
    weekIndex: s.week_index,
    weekday: s.weekday,
    startTime: s.start_time.slice(0, 5),
    endTime: s.end_time.slice(0, 5),
    kind: s.kind,
    label: s.label,
    breaks: s.breaks as unknown as TemplateBreak[],
    supplementTypeIds: s.supplement_type_ids,
    projectId: s.project_id,
  }));
  return { rotation, slots: mapped };
}

function shiftRows(
  organizationId: string,
  departmentId: string,
  rolloutId: string,
  plan: ReturnType<typeof planRollout>,
) {
  return plan.map((p) => ({
    organization_id: organizationId,
    department_id: departmentId,
    employee_id: p.employeeId,
    start_at: formatInstant(wallTime(p.date, p.startTime, TZ)),
    end_at: formatInstant(
      wallTime(p.endsNextDay ? engineAddDays(p.date, 1) : p.date, p.endTime, TZ),
    ),
    breaks: asJson(formBreaksToDb(p.breaks, p.date)),
    supplement_type_ids: p.supplementTypeIds,
    project_allocations: asJson(
      p.projectId ? [{ project_id: p.projectId, start_at: null, end_at: null, minutes: null }] : [],
    ),
    kind: p.kind,
    label: p.label,
    rollout_id: rolloutId,
    rotation_slot_id: p.slotId,
  }));
}

export async function rolloutAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireContext(["schedule.manage"]);
  const values = formValues(formData);
  const parsed = rolloutSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  const supabase = await createClient();
  const { rotation, slots } = await loadSlots(supabase, parsed.data.rotation_id);
  if (!rotation) return { message: da.common.notAllowed, values };

  const { data: rollout, error } = await supabase
    .from("rotation_rollout")
    .insert({
      organization_id: ctx.organization.id,
      rotation_id: rotation.id,
      department_id: rotation.department_id,
      start_date: parsed.data.start_date,
      weeks: parsed.data.weeks,
      assignments: asJson(parsed.data.assignments),
    })
    .select("id")
    .single();
  if (error || !rollout) return { message: dbErrorMessage(error), values };

  const plan = planRollout({
    lengthWeeks: rotation.length_weeks,
    slots,
    startDate: parsed.data.start_date,
    weeks: parsed.data.weeks,
    assignments: parsed.data.assignments,
  });
  if (plan.length) {
    const { error: insError } = await supabase
      .from("shift")
      .insert(shiftRows(ctx.organization.id, rotation.department_id, rollout.id, plan));
    if (insError) return { message: dbErrorMessage(insError), values };
  }
  revalidateRotation(rotation.id);
  revalidatePath("/vagtplan", "layout");
  return { ok: true, message: da.turnus.rolledOut(plan.length) };
}

/**
 * Re-applies the current template to a rollout: shifts from the rollout that
 * were never published are archived and recreated; published ones are kept.
 */
export async function rerollAction(input: { rolloutId: string }): Promise<ActionState> {
  const ctx = await requireContext(["schedule.manage"]);
  const rolloutId = z.guid().parse(input.rolloutId);
  const supabase = await createClient();
  const { data: rollout } = await supabase
    .from("rotation_rollout")
    .select("id, rotation_id, department_id, start_date, weeks, assignments")
    .eq("id", rolloutId)
    .maybeSingle();
  if (!rollout) return { message: da.common.notAllowed };
  const { rotation, slots } = await loadSlots(supabase, rollout.rotation_id);
  if (!rotation) return { message: da.common.notAllowed };

  const { data: existing } = await supabase
    .from("shift")
    .select("id, published, rotation_slot_id, start_at")
    .eq("rollout_id", rolloutId)
    .is("archived_at", null);
  const neverPublished = (existing ?? []).filter((s) => s.published === null);
  const kept = (existing ?? []).filter((s) => s.published !== null);
  if (neverPublished.length) {
    const { error } = await supabase
      .from("shift")
      .update({ archived_at: new Date().toISOString() })
      .in(
        "id",
        neverPublished.map((s) => s.id),
      );
    if (error) return { message: dbErrorMessage(error) };
  }
  // Recreate everything except slot occurrences that are still published.
  const keptKeys = new Set(kept.map((s) => `${s.rotation_slot_id}|${s.start_at.slice(0, 10)}`));
  const plan = planRollout({
    lengthWeeks: rotation.length_weeks,
    slots,
    startDate: rollout.start_date,
    weeks: rollout.weeks,
    assignments: rollout.assignments as unknown as RolloutAssignment[],
  });
  const rows = shiftRows(ctx.organization.id, rollout.department_id, rollout.id, plan).filter(
    (r) => !keptKeys.has(`${r.rotation_slot_id}|${r.start_at.slice(0, 10)}`),
  );
  if (rows.length) {
    const { error } = await supabase.from("shift").insert(rows);
    if (error) return { message: dbErrorMessage(error) };
  }
  revalidateRotation(rotation.id);
  revalidatePath("/vagtplan", "layout");
  return { ok: true, message: da.turnus.rerolled(rows.length, kept.length) };
}
