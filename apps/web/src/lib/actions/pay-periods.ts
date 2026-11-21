"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, payPeriodGroupSchema } from "@/lib/forms/schemas";
import { da } from "@/lib/i18n/da";
import { dbErrorMessage, formValues, type ActionState } from "./state";

export async function createPayPeriodGroupAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireContext(["settings.manage"]);
  const values = formValues(formData);
  const parsed = payPeriodGroupSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  const supabase = await createClient();
  const { error } = await supabase
    .from("pay_period_group")
    .insert({ ...parsed.data, organization_id: ctx.organization.id });
  if (error) return { message: dbErrorMessage(error), values };
  revalidatePath("/indstillinger/lonperioder");
  return { ok: true, message: da.common.saved };
}

const groupHint = (hint: string | undefined) =>
  hint === "group_in_use"
    ? da.payPeriodGroups.inUse
    : hint === "group_has_contracts"
      ? da.payPeriodGroups.hasContracts
      : undefined;

/** Edits a group: the name always; the schedule only while no period is calculated. */
export async function updatePayPeriodGroupAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireContext(["settings.manage"]);
  const values = formValues(formData);
  const id = z.guid().safeParse(values.id);
  const parsed = payPeriodGroupSchema.safeParse(values);
  if (!id.success) return { message: da.common.unknownError, values };
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  const g = parsed.data;
  const monthly = g.frequency === "monthly";
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_pay_period_group", {
    p_id: id.data,
    p_name: g.name,
    p_frequency: g.frequency,
    p_anchor_date: (monthly ? null : g.anchor_date) as string,
    p_month_start_day: (monthly ? g.month_start_day : null) as number,
  });
  if (error) return { message: groupHint(error.hint) ?? dbErrorMessage(error), values };
  revalidatePath("/indstillinger/lonperioder");
  revalidatePath("/lon");
  return { ok: true, message: da.common.saved };
}

/** Deletes (archives) a group that no active contract uses. */
export async function archivePayPeriodGroupAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireContext(["settings.manage"]);
  const id = z.guid().safeParse(formData.get("id"));
  if (!id.success) return { message: da.common.unknownError };
  const supabase = await createClient();
  const { error } = await supabase.rpc("archive_pay_period_group", { p_id: id.data });
  if (error) return { message: groupHint(error.hint) ?? dbErrorMessage(error) };
  revalidatePath("/indstillinger/lonperioder");
  revalidatePath("/lon");
  return { ok: true, message: da.payPeriodGroups.deleted };
}
