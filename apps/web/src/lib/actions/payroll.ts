"use server";
import { sendWebhooksSoon } from "@/lib/api/notify";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { exportSettingsSchema } from "@/lib/domain/export";
import { calculateAndSave } from "@/lib/payroll/calculate";
import { employeesInPeriod } from "@/lib/payroll/periods";
import { da } from "@/lib/i18n/da";
import { dbErrorMessage, type ActionState } from "./state";

async function loadPeriod(supabase: Awaited<ReturnType<typeof createClient>>, id: string) {
  const { data } = await supabase
    .from("pay_period")
    .select("id, group_id, start_date, end_date, status")
    .eq("id", z.guid().parse(id))
    .maybeSingle();
  return data;
}

/** Calculates every employee in the period (a new run each; the database refuses closed periods). */
export async function calculatePeriodAction(periodId: string): Promise<ActionState> {
  const ctx = await requireContext(["payroll.manage"]);
  const supabase = await createClient();
  const p = await loadPeriod(supabase, periodId);
  if (!p) return { message: da.common.notAllowed };
  const employees = await employeesInPeriod(supabase, {
    groupId: p.group_id,
    start: p.start_date,
    end: p.end_date,
  });
  let n = 0;
  for (const e of employees) {
    const problem = await calculateAndSave(
      supabase,
      ctx,
      { id: p.id, start: p.start_date, end: p.end_date },
      e.id,
    );
    if (problem) return { message: problem };
    n++;
  }
  revalidatePath(`/lon/${p.id}`);
  return { ok: true, message: da.payroll.calculated(n) };
}

export async function closePeriodAction(periodId: string): Promise<ActionState> {
  // Events recorded by the database are sent to webhooks after the response.
  sendWebhooksSoon();
  await requireContext(["payroll.manage"]);
  const supabase = await createClient();
  const { error } = await supabase.rpc("close_pay_period", { p_id: z.guid().parse(periodId) });
  if (error) return { message: dbErrorMessage(error) };
  revalidatePath("/lon", "layout");
  return { ok: true, message: da.payroll.closed };
}

const templateInput = z.object({
  id: z.guid().nullable(),
  name: z.string().trim().min(1, da.validation.required).max(100, da.validation.tooLong),
  settings: exportSettingsSchema,
});

export async function saveTemplateAction(input: unknown): Promise<ActionState & { id?: string }> {
  const ctx = await requireContext(["payroll.manage"]);
  const parsed = templateInput.safeParse(input);
  if (!parsed.success)
    return { message: parsed.error.issues[0]?.message ?? da.common.unknownError };
  const supabase = await createClient();
  const row = {
    name: parsed.data.name,
    settings: parsed.data.settings,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = parsed.data.id
    ? await supabase
        .from("export_template")
        .update(row)
        .eq("id", parsed.data.id)
        .select("id")
        .single()
    : await supabase
        .from("export_template")
        .insert({ ...row, organization_id: ctx.organization.id })
        .select("id")
        .single();
  if (error) return { message: dbErrorMessage(error, { "23505": da.payroll.templateNameTaken }) };
  revalidatePath("/lon", "layout");
  return { ok: true, message: da.payroll.templateSaved, id: data.id };
}

export async function archiveTemplateAction(id: string): Promise<ActionState> {
  await requireContext(["payroll.manage"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("export_template")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", z.guid().parse(id));
  if (error) return { message: dbErrorMessage(error) };
  revalidatePath("/lon", "layout");
  return { ok: true };
}
