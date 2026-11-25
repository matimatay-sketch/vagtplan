"use server";
import { sendWebhooksSoon } from "@/lib/api/notify";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors } from "@/lib/forms/schemas";
import { timeEntryFormSchema } from "@/lib/forms/time";
import { allocationProblems } from "@/lib/domain/projects";
import { formPostingToDb } from "@/lib/domain/posting";
import { needsReason } from "@/lib/domain/time-entries";
import type { StampResult } from "@/lib/domain/stamp-queue";
import { formBreaksToDb, localInstants } from "@/lib/schedule/breaks";
import { da } from "@/lib/i18n/da";
import { reasonsFor, situations } from "@/lib/domain/deviation";
import { loadDeviationContext } from "@/lib/time/deviation-context";
import { reasonsForEmployee } from "@/lib/time/deviation-types";
import type { Json } from "@/lib/supabase/database.types";
import { dbErrorMessage, formValues, type ActionState } from "./state";

const asJson = (v: unknown) => v as NonNullable<Json>;

function revalidateTime() {
  revalidatePath("/tid", "layout");
  revalidatePath("/projekter");
}

const stampSchema = z
  .array(
    z.object({
      clientId: z.guid(),
      action: z.enum(["in", "out"]),
      at: z.iso.datetime({ offset: true }),
      organizationId: z.guid(),
      posting: z.record(z.guid(), z.guid()).optional(),
      reasonId: z.guid().optional(),
      reasonAt: z.enum(["start", "end"]).optional(),
      position: z
        .object({
          latitude: z.number().min(-90).max(90),
          longitude: z.number().min(-180).max(180),
          accuracy: z.number().min(0).max(100_000),
        })
        .optional(),
    }),
  )
  .max(50);

/**
 * Replays queued stamps in order. Idempotent: the database returns the same
 * registration for a client UUID it has already received.
 */
export async function syncStampsAction(input: unknown): Promise<StampResult[]> {
  await requireContext();
  const events = stampSchema.parse(input);
  const supabase = await createClient();
  const out: StampResult[] = [];
  for (const e of events) {
    const { data: entryId, error } = await supabase.rpc("stamp", {
      p_organization_id: e.organizationId,
      p_client_id: e.clientId,
      p_action: e.action,
      p_at: e.at,
      ...(e.position
        ? {
            p_latitude: e.position.latitude,
            p_longitude: e.position.longitude,
            p_accuracy: e.position.accuracy,
          }
        : {}),
      ...(e.posting && Object.keys(e.posting).length
        ? {
            p_posting_allocations: asJson([
              { values: e.posting, start_at: null, end_at: null, minutes: null },
            ]),
          }
        : {}),
    });
    // The deviation reason chosen when stamping (RLS: the employee's own registration).
    if (!error && entryId && e.reasonId)
      await supabase
        .from("time_entry")
        .update(
          e.reasonAt === "end" ? { end_reason_id: e.reasonId } : { start_reason_id: e.reasonId },
        )
        .eq("id", entryId);
    if (!error) out.push({ clientId: e.clientId, status: "ok" });
    // The server answered, so the stamp leaves the queue either way; only a
    // network failure (the action throws in the browser) keeps it queued.
    else
      out.push({
        clientId: e.clientId,
        status: "rejected",
        reason: error.code === "P0001" ? (error.hint ?? "unknown") : "unknown",
      });
  }
  if (out.length) revalidateTime();
  return out;
}

export async function completeAsPlannedAction(shiftIds: string[]): Promise<ActionState> {
  await requireContext();
  const ids = z.array(z.guid()).min(1).max(200).parse(shiftIds);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("complete_as_planned", { p_shift_ids: ids });
  if (error) return { message: dbErrorMessage(error) };
  revalidateTime();
  return { ok: true, message: da.time.completed(data ?? 0) };
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** The plan behind a registration (published snapshot), if any. */
async function planFor(
  supabase: Supabase,
  shiftId: string | null | undefined,
  startAt: string,
): Promise<{ start: string; end: string } | null> {
  if (!shiftId) return null;
  const { data } = await supabase.rpc("time_overview", {
    p_from: new Date(new Date(startAt).getTime() - 2 * 86_400_000).toISOString(),
    p_to: new Date(new Date(startAt).getTime() + 2 * 86_400_000).toISOString(),
  });
  const r = (data ?? []).find((x) => x.shift_id === shiftId);
  return r?.plan_start && r.plan_end ? { start: r.plan_start, end: r.plan_end } : null;
}

/** Chosen deviation reasons, required where reasons are set up for the situation. */
async function resolveReasons(
  supabase: Supabase,
  orgId: string,
  employeeId: string | null | undefined,
  times: { start_at: string; end_at: string },
  plan: { start: string; end: string } | null,
  f: { start_reason_id?: string | null; end_reason_id?: string | null },
): Promise<
  { startReason: string | null; endReason: string | null } | { errors: Record<string, string> }
> {
  const deviation = await loadDeviationContext(supabase, orgId, employeeId ? [employeeId] : []);
  const options = reasonsForEmployee(deviation, employeeId);
  const sit = situations(
    { start: times.start_at, end: times.end_at },
    plan,
    deviation.thresholdMinutes,
  );
  const startSituation = sit.unplanned ? "unplanned" : (sit.start?.kind ?? null);
  const startOptions = startSituation ? reasonsFor(startSituation, options) : [];
  const endOptions = sit.end ? reasonsFor(sit.end.kind, options) : [];
  const startReason = startOptions.some((r) => r.id === f.start_reason_id)
    ? f.start_reason_id!
    : null;
  const endReason = endOptions.some((r) => r.id === f.end_reason_id) ? f.end_reason_id! : null;
  const errors: Record<string, string> = {};
  if (startOptions.length && !startReason)
    errors.start_reason_id = da.deviationReasons.reasonRequired;
  if (endOptions.length && !endReason) errors.end_reason_id = da.deviationReasons.reasonRequired;
  return Object.keys(errors).length ? { errors } : { startReason, endReason };
}

/**
 * Creates or edits a registration that is not approved yet. Employees save
 * their own; others need time.manage (enforced by RLS). Times that differ
 * from the plan need a reason.
 */
export async function saveTimeEntryAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireContext();
  const values = formValues(formData);
  const parsed = timeEntryFormSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  const f = parsed.data;
  const supabase = await createClient();

  const times = localInstants(f.date, f.start_time, f.end_time, f.endsNextDay);
  const breaks = formBreaksToDb(f.breaks, f.date);
  const posting = formPostingToDb(f.posting_allocations, f.date);
  const postingProblems = allocationProblems(
    { start: times.start_at, end: times.end_at, breaks },
    posting,
  );
  if (postingProblems.length)
    return {
      errors: {
        posting_allocations: postingProblems.map((x) => da.projects.problems[x]).join(". "),
      },
      values,
    };

  // The plan behind the registration (published snapshot), if any.
  let existing: { employee_id: string; department_id: string; shift_id: string | null } | null =
    null;
  if (f.id) {
    const { data } = await supabase
      .from("time_entry")
      .select("employee_id, department_id, shift_id, status")
      .eq("id", f.id)
      .maybeSingle();
    if (!data) return { message: da.common.notAllowed, values };
    if (data.status === "approved") return { message: da.time.approvedLocked, values };
    existing = data;
  }
  const shiftId = existing?.shift_id ?? f.shift_id;
  const plan = await planFor(supabase, shiftId, times.start_at);
  // A deviation reason is required where one is set up for the situation and the
  // deviation is over the threshold; otherwise a written reason as before.
  const reasons = await resolveReasons(
    supabase,
    ctx.organization.id,
    existing?.employee_id ?? f.employee_id ?? ctx.employee?.id,
    times,
    plan,
    f,
  );
  if ("errors" in reasons) return { errors: reasons.errors, values };
  const { startReason, endReason } = reasons;
  if (
    !startReason &&
    !endReason &&
    needsReason({ start: times.start_at, end: times.end_at }, plan) &&
    (f.deviation_reason ?? "").length < 3
  )
    return { errors: { deviation_reason: da.time.reasonRequired }, values };

  const row = {
    ...times,
    breaks: asJson(breaks),
    posting_allocations: asJson(posting),
    supplement_type_ids: f.supplement_type_ids,
    deviation_reason: f.deviation_reason,
    start_reason_id: startReason,
    end_reason_id: endReason,
    note: f.note,
    kind: f.kind,
  };
  if (existing) {
    const { data, error } = await supabase
      .from("time_entry")
      .update({ ...row, status: "pending" as const })
      .eq("id", f.id!)
      .select("id");
    if (error) return { message: dbErrorMessage(error), values };
    if (!data?.length) return { message: da.common.notAllowed, values };
  } else {
    const employeeId = f.employee_id ?? ctx.employee?.id;
    if (!employeeId) return { message: da.common.notAllowed, values };
    let departmentId = f.department_id;
    if (!departmentId) {
      const { data } = await supabase
        .from("employee_department")
        .select("department_id, is_primary")
        .eq("employee_id", employeeId)
        .order("is_primary", { ascending: false })
        .limit(1)
        .maybeSingle();
      departmentId = data?.department_id ?? null;
    }
    if (!departmentId) return { message: da.common.notAllowed, values };
    const { error } = await supabase.from("time_entry").insert({
      ...row,
      organization_id: ctx.organization.id,
      employee_id: employeeId,
      department_id: departmentId,
      shift_id: f.shift_id,
      source: "manual",
      status: "pending",
    });
    if (error) return { message: dbErrorMessage(error), values };
  }
  revalidateTime();
  return { ok: true, message: da.common.saved };
}

/** Removes a registration that is not approved (kept in the audit log). */
export async function archiveTimeEntryAction(id: string): Promise<ActionState> {
  await requireContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("time_entry")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", z.guid().parse(id))
    .neq("status", "approved")
    .select("id");
  if (error) return { message: dbErrorMessage(error) };
  if (!data?.length) return { message: da.common.notAllowed };
  revalidateTime();
  return { ok: true };
}

/** The database checks time.approve on the department or the personal approver. */
export async function approveTimeEntriesAction(ids: string[]): Promise<ActionState> {
  // Events recorded by the database are sent to webhooks after the response.
  sendWebhooksSoon();
  await requireContext();
  const parsed = z.array(z.guid()).min(1).max(500).parse(ids);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("approve_time_entries", { p_ids: parsed });
  if (error) return { message: dbErrorMessage(error) };
  revalidateTime();
  return { ok: true, message: da.time.approvedCount(data ?? 0) };
}

/** Undo an approval: back to "waiting for approval" (not in a closed pay period). */
export async function unapproveTimeEntriesAction(ids: string[]): Promise<ActionState> {
  await requireContext();
  const parsed = z.array(z.guid()).min(1).max(500).parse(ids);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("unapprove_time_entries", { p_ids: parsed });
  if (error)
    return {
      message: error.hint === "period_closed" ? da.time.periodClosed : dbErrorMessage(error),
    };
  revalidateTime();
  return { ok: true, message: da.time.unapprovedCount(data ?? 0) };
}

/** Correction of an approved registration: a new version (needs approval again). */
export async function correctTimeEntryAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireContext(["time.manage"]);
  const values = formValues(formData);
  const parsed = timeEntryFormSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  const f = parsed.data;
  if (!f.id) return { message: da.common.unknownError, values };
  if ((f.deviation_reason ?? "").length < 5)
    return { errors: { deviation_reason: da.time.reasonRequired }, values };
  const times = localInstants(f.date, f.start_time, f.end_time, f.endsNextDay);
  const breaks = formBreaksToDb(f.breaks, f.date);
  const posting = formPostingToDb(f.posting_allocations, f.date);
  const postingProblems = allocationProblems(
    { start: times.start_at, end: times.end_at, breaks },
    posting,
  );
  if (postingProblems.length)
    return {
      errors: {
        posting_allocations: postingProblems.map((x) => da.projects.problems[x]).join(". "),
      },
      values,
    };
  const supabase = await createClient();
  const { data: current } = await supabase
    .from("time_entry")
    .select("shift_id, organization_id, employee_id")
    .eq("id", f.id)
    .maybeSingle();
  if (!current) return { message: da.common.notAllowed, values };
  const plan = await planFor(supabase, current.shift_id, times.start_at);
  const reasons = await resolveReasons(
    supabase,
    current.organization_id,
    current.employee_id,
    times,
    plan,
    f,
  );
  if ("errors" in reasons) return { errors: reasons.errors, values };
  const { data: newId, error } = await supabase.rpc("correct_time_entry", {
    p_id: f.id,
    p_start_at: times.start_at,
    p_end_at: times.end_at,
    p_breaks: asJson(breaks),
    // Projects are a posting dimension; the old column is no longer written.
    p_project_allocations: [],
    p_posting_allocations: asJson(posting),
    p_supplement_type_ids: f.supplement_type_ids,
    p_reason: f.deviation_reason!,
  });
  if (error) return { message: dbErrorMessage(error), values };
  // The new version is pending, so the reasons can be set on it.
  if (newId) {
    const { error: reasonError } = await supabase
      .from("time_entry")
      .update({ start_reason_id: reasons.startReason, end_reason_id: reasons.endReason })
      .eq("id", newId);
    if (reasonError) return { message: dbErrorMessage(reasonError), values };
  }
  revalidateTime();
  return { ok: true, message: da.common.saved };
}

export async function timeEntryHistoryAction(id: string) {
  await requireContext();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("time_entry_history", { p_id: z.guid().parse(id) });
  if (error) throw new Error(dbErrorMessage(error));
  return data ?? [];
}
