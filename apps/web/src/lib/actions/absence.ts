"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors } from "@/lib/forms/schemas";
import { absenceRequestSchema, leavePostingSchema } from "@/lib/forms/absence";
import { todayIn } from "@/lib/domain/civil-date";
import { engineInputs, usageFor } from "@/lib/absence/load";
import { balances, formatDays } from "@/lib/domain/leave";
import { vacationMoveLimit } from "@vagtplan/rules-engine";
import { da } from "@/lib/i18n/da";
import { dbErrorMessage, formValues, type ActionState } from "./state";

const overlap = { "23P01": da.absence.overlap };

function revalidateAbsence() {
  revalidatePath("/fravaer", "layout");
  revalidatePath("/vagtplan", "layout");
  revalidatePath("/oversigt");
}

/** Approves with usage postings from the employee's agreement (days drawn oldest first). */
async function approve(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ctx: Awaited<ReturnType<typeof requireContext>>,
  id: string,
  note: string | null,
): Promise<string | null> {
  const { data: a } = await supabase
    .from("absence")
    .select("id, employee_id, type_code, from_date, to_date")
    .eq("id", id)
    .maybeSingle();
  if (!a) return da.common.notAllowed;
  const input = (await engineInputs(supabase, ctx, [a.employee_id])).get(a.employee_id);
  const usage = input
    ? await usageFor(
        supabase,
        input,
        { employeeId: a.employee_id, typeCode: a.type_code, from: a.from_date, to: a.to_date },
        todayIn(ctx.organization.timezone),
      )
    : [];
  const { error } = await supabase.rpc("decide_absence", {
    p_id: id,
    p_approve: true,
    p_note: note ?? "",
    p_usage: usage,
  });
  return error ? dbErrorMessage(error) : null;
}

/** An employee requests leave (or a manager on their behalf). */
export async function requestAbsenceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireContext();
  const values = formValues(formData);
  const parsed = absenceRequestSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  const employeeId = parsed.data.employee_id ?? ctx.employee?.id;
  if (!employeeId) return { message: da.common.notAllowed, values };
  const supabase = await createClient();
  const { error } = await supabase.from("absence").insert({
    organization_id: ctx.organization.id,
    employee_id: employeeId,
    type_code: parsed.data.type_code,
    from_date: parsed.data.from_date,
    to_date: parsed.data.to_date,
    note: parsed.data.note,
  });
  if (error) return { message: dbErrorMessage(error, overlap), values };
  revalidateAbsence();
  return { ok: true, message: da.absence.sent };
}

/** A manager registers absence that is approved at once (e.g. sickness). */
export async function registerAbsenceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireContext(["absence.manage"]);
  const values = formValues(formData);
  const parsed = absenceRequestSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  if (!parsed.data.employee_id) return { errors: { employee_id: da.validation.required }, values };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("absence")
    .insert({
      organization_id: ctx.organization.id,
      employee_id: parsed.data.employee_id,
      type_code: parsed.data.type_code,
      from_date: parsed.data.from_date,
      to_date: parsed.data.to_date,
      note: parsed.data.note,
    })
    .select("id")
    .single();
  if (error) return { message: dbErrorMessage(error, overlap), values };
  const problem = await approve(supabase, ctx, data.id, null);
  revalidateAbsence();
  if (problem) return { message: problem, values };
  return { ok: true, message: da.absence.registered };
}

export async function decideAbsenceAction(
  id: string,
  approved: boolean,
  note: string,
): Promise<ActionState> {
  const ctx = await requireContext();
  const p = z.object({ id: z.guid(), note: z.string().max(500) }).parse({ id, note });
  const supabase = await createClient();
  let problem: string | null;
  if (approved) problem = await approve(supabase, ctx, p.id, p.note.trim() || null);
  else {
    const { error } = await supabase.rpc("decide_absence", {
      p_id: p.id,
      p_approve: false,
      p_note: p.note,
      p_usage: [],
    });
    problem = error ? dbErrorMessage(error) : null;
  }
  if (problem) return { message: problem };
  revalidateAbsence();
  return { ok: true, message: approved ? da.absence.approved : da.absence.rejected };
}

export async function cancelAbsenceAction(id: string, note = ""): Promise<ActionState> {
  await requireContext();
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_absence", {
    p_id: z.guid().parse(id),
    p_note: z.string().max(500).parse(note),
  });
  if (error) return { message: dbErrorMessage(error) };
  revalidateAbsence();
  return { ok: true, message: da.absence.cancelled };
}

export async function addLeavePostingAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireContext(["absence.manage"]);
  const values = formValues(formData);
  const parsed = leavePostingSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  const f = parsed.data;
  const supabase = await createClient();
  // Transfers and payouts of vacation follow the configured limits.
  if (
    f.account === "vacation" &&
    (f.kind === "transfer" || f.kind === "payout") &&
    f.hundredths < 0
  ) {
    const ctx = await requireContext();
    const input = (await engineInputs(supabase, ctx, [f.employee_id])).get(f.employee_id);
    const { data: rows } = await supabase
      .from("leave_posting")
      .select("account, kind, period_start, usable_until, hundredths")
      .eq("employee_id", f.employee_id)
      .eq("account", "vacation")
      .eq("period_start", f.period_start);
    const row = balances(
      (rows ?? []).map((p) => ({
        account: p.account,
        kind: p.kind,
        periodStart: p.period_start,
        usableUntil: p.usable_until,
        hundredths: p.hundredths,
      })),
    )[0] ?? { earned: 0, balance: 0, other: 0 };
    if (input) {
      let limit: { allowed: boolean; max: number };
      try {
        limit = vacationMoveLimit(input, todayIn(ctx.organization.timezone), f.kind, row);
      } catch {
        // No agreement in force today: refuse rather than guess.
        return { message: da.absence.moveNotAllowed[f.kind], values };
      }
      if (!limit.allowed) return { message: da.absence.moveNotAllowed[f.kind], values };
      if (-f.hundredths > limit.max)
        return { errors: { days: da.absence.moveTooMuch(formatDays(limit.max)) }, values };
    }
  }
  const { error } = await supabase.rpc("add_leave_posting", {
    p_employee_id: f.employee_id,
    p_account: f.account,
    p_kind: f.kind,
    p_period_start: f.period_start,
    p_usable_until: f.usable_until,
    p_hundredths: f.hundredths,
    p_note: f.note,
  });
  if (error) return { message: dbErrorMessage(error), values };
  revalidateAbsence();
  return { ok: true, message: da.absence.posted };
}
