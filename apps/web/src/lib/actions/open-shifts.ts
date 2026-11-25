"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireContext } from "@/lib/auth";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { reassignViolations } from "@/lib/messages/swap-check";
import { RULE_CATALOG } from "@/lib/schedule/rule-handling";
import { da } from "@/lib/i18n/da";
import { dbErrorMessage, type ActionState } from "./state";

const t = da.openShifts;

const hintText = (error: { code?: string; hint?: string } | null) =>
  (error?.hint && t.errors[error.hint]) || dbErrorMessage(error);

const rulesBroken = (codes: { code: string; message: string }[]) =>
  t.rulesBroken(
    [
      ...new Set(codes.map((v) => RULE_CATALOG.find((r) => r.code === v.code)?.label ?? v.message)),
    ].join(", "),
  );

function refresh() {
  revalidatePath("/min-vagtplan");
  revalidatePath("/oversigt");
  revalidatePath("/aktiviteter", "layout");
  revalidatePath("/vagtplan", "layout");
}

/**
 * The employee takes an open shift, or asks for it where the department wants
 * to approve. The working-time rules are checked first (only new blocking
 * breaches count), the competences and the rest by the database.
 */
export async function takeOpenShiftAction(shiftId: string): Promise<ActionState> {
  const ctx = await requireContext();
  if (!ctx.employee) return { message: da.common.notAllowed };
  const id = z.guid().parse(shiftId);
  const supabase = await createClient();
  // The database confirms the employee may see the shift before the service client is used.
  const { data: missing, error: seeError } = await supabase.rpc("missing_competences", {
    p_employee_id: ctx.employee.id,
    p_shift_id: id,
  });
  if (seeError || missing === null) return { message: da.common.notAllowed };
  if (missing.length) return { message: t.errors.missing_competence! };
  const db = createServiceClient();
  const broken = await reassignViolations(
    db,
    ctx.organization.id,
    { [id]: ctx.employee.id },
    ctx.organization.timezone,
  );
  if (broken.length) return { message: rulesBroken(broken) };
  const { data, error } = await db.rpc("take_open_shift", { p_actor: ctx.userId, p_shift_id: id });
  if (error) return { message: hintText(error) };
  refresh();
  return { ok: true, message: data === "taken" ? t.taken : t.requested };
}

export async function withdrawOpenShiftRequestAction(requestId: string): Promise<ActionState> {
  await requireContext();
  const supabase = await createClient();
  const { error } = await supabase.rpc("withdraw_open_shift_request", {
    p_id: z.guid().parse(requestId),
  });
  if (error) return { message: dbErrorMessage(error) };
  refresh();
  return { ok: true, message: t.withdrawn };
}

/** The leader approves (rules checked for the employee) or rejects a request. */
export async function decideOpenShiftRequestAction(
  requestId: string,
  approve: boolean,
): Promise<ActionState> {
  const ctx = await requireContext(["schedule.manage"]);
  const id = z.guid().parse(requestId);
  const supabase = await createClient();
  // RLS: only the department's planners see the request.
  const { data: r } = await supabase
    .from("open_shift_request")
    .select("shift_id, employee_id, status")
    .eq("id", id)
    .maybeSingle();
  if (!r) return { message: da.common.notAllowed };
  if (r.status !== "requested") return { message: t.errors.request_closed! };
  const db = createServiceClient();
  if (approve) {
    const broken = await reassignViolations(
      db,
      ctx.organization.id,
      { [r.shift_id]: r.employee_id },
      ctx.organization.timezone,
    );
    if (broken.length) return { message: rulesBroken(broken) };
  }
  const { error } = await db.rpc("decide_open_shift_request", {
    p_actor: ctx.userId,
    p_id: id,
    p_approve: approve,
  });
  if (error) return { message: hintText(error) };
  refresh();
  return { ok: true, message: approve ? t.approved : t.rejected };
}
