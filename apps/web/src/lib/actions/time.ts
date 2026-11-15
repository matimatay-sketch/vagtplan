"use server";
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
import { formBreaksToDb, formProjectsToDb, localInstants } from "@/lib/schedule/breaks";
import { da } from "@/lib/i18n/da";
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
    const { error } = await supabase.rpc("stamp", {
      p_organization_id: e.organizationId,
      p_client_id: e.clientId,
      p_action: e.action,
      p_at: e.at,
      ...(e.posting && Object.keys(e.posting).length
        ? {
            p_posting_allocations: asJson([
              { values: e.posting, start_at: null, end_at: null, minutes: null },
            ]),
          }
        : {}),
    });
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
  const allocations = formProjectsToDb(f.project_allocations, f.date);
  const problems = allocationProblems(
    { start: times.start_at, end: times.end_at, breaks },
    allocations,
  );
  if (problems.length)
    return {
      errors: { project_allocations: problems.map((x) => da.projects.problems[x]).join(". ") },
      values,
    };
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
  let plan: { start: string; end: string } | null = null;
  if (shiftId) {
    const { data } = await supabase.rpc("time_overview", {
      p_from: new Date(new Date(times.start_at).getTime() - 2 * 86_400_000).toISOString(),
      p_to: new Date(new Date(times.start_at).getTime() + 2 * 86_400_000).toISOString(),
    });
    const r = (data ?? []).find((x) => x.shift_id === shiftId);
    if (r?.plan_start && r.plan_end) plan = { start: r.plan_start, end: r.plan_end };
  }
  if (
    needsReason({ start: times.start_at, end: times.end_at }, plan) &&
    (f.deviation_reason ?? "").length < 3
  )
    return { errors: { deviation_reason: da.time.reasonRequired }, values };

  const row = {
    ...times,
    breaks: asJson(breaks),
    project_allocations: asJson(allocations),
    posting_allocations: asJson(posting),
    deviation_reason: f.deviation_reason,
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
  await requireContext();
  const parsed = z.array(z.guid()).min(1).max(500).parse(ids);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("approve_time_entries", { p_ids: parsed });
  if (error) return { message: dbErrorMessage(error) };
  revalidateTime();
  return { ok: true, message: da.time.approvedCount(data ?? 0) };
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
  const allocations = formProjectsToDb(f.project_allocations, f.date);
  const problems = allocationProblems(
    { start: times.start_at, end: times.end_at, breaks },
    allocations,
  );
  if (problems.length)
    return {
      errors: { project_allocations: problems.map((x) => da.projects.problems[x]).join(". ") },
      values,
    };
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
  const { error } = await supabase.rpc("correct_time_entry", {
    p_id: f.id,
    p_start_at: times.start_at,
    p_end_at: times.end_at,
    p_breaks: asJson(breaks),
    p_project_allocations: asJson(allocations),
    p_posting_allocations: asJson(posting),
    p_reason: f.deviation_reason!,
  });
  if (error) return { message: dbErrorMessage(error), values };
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
