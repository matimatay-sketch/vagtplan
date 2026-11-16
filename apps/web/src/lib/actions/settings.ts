"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors } from "@/lib/forms/schemas";
import {
  leaveRulesSchema,
  noticeSchema,
  ruleHandlingFromForm,
  supplementTypeSchema,
} from "@/lib/forms/settings";
import { da } from "@/lib/i18n/da";
import { dbErrorMessage, formValues, type ActionState } from "./state";

function revalidateSettings() {
  revalidatePath("/indstillinger/opsaetning");
  revalidatePath("/vagtplan", "layout");
}

export async function saveNoticeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireContext(["settings.manage"]);
  const values = formValues(formData);
  const parsed = noticeSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_settings")
    .update(parsed.data)
    .eq("organization_id", ctx.organization.id)
    .select("organization_id");
  if (error) return { message: dbErrorMessage(error), values };
  if (!data?.length) return { message: da.common.notAllowed, values };
  revalidateSettings();
  return { ok: true, message: da.common.saved };
}

export async function saveRuleHandlingAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireContext(["settings.manage"]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_settings")
    .update({ rule_handling: ruleHandlingFromForm(formValues(formData)) })
    .eq("organization_id", ctx.organization.id)
    .select("organization_id");
  if (error) return { message: dbErrorMessage(error) };
  if (!data?.length) return { message: da.common.notAllowed };
  revalidateSettings();
  return { ok: true, message: da.common.saved };
}

export async function createSupplementTypeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireContext(["settings.manage"]);
  const values = formValues(formData);
  const parsed = supplementTypeSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  const supabase = await createClient();
  const { error } = await supabase
    .from("supplement_type")
    .insert({ ...parsed.data, organization_id: ctx.organization.id });
  if (error)
    return {
      message: dbErrorMessage(error, { "23505": "Der findes allerede et tillæg med det navn." }),
      values,
    };
  revalidateSettings();
  return { ok: true, message: da.common.saved };
}

export async function setSupplementSelectableAction(formData: FormData) {
  await requireContext(["settings.manage"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("supplement_type")
    .update({ employee_selectable: formData.get("employee_selectable") === "true" })
    .eq("id", z.guid().parse(formData.get("id")));
  if (error) throw new Error(dbErrorMessage(error));
  revalidateSettings();
}

export async function archiveSupplementTypeAction(formData: FormData) {
  await requireContext(["settings.manage"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("supplement_type")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", z.guid().parse(formData.get("id")));
  if (error) throw new Error(dbErrorMessage(error));
  revalidateSettings();
}

export async function saveLeaveRulesAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireContext(["settings.manage"]);
  const values = formValues(formData);
  const parsed = leaveRulesSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_settings")
    .update({ leave_rules: parsed.data })
    .eq("organization_id", ctx.organization.id)
    .select("organization_id");
  if (error) return { message: dbErrorMessage(error), values };
  if (!data?.length) return { message: da.common.notAllowed, values };
  revalidateSettings();
  revalidatePath("/fravaer", "layout");
  return { ok: true, message: da.common.saved };
}
