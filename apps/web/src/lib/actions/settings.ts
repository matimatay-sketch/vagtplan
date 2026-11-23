"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors } from "@/lib/forms/schemas";
import {
  leaveRulesSchema,
  noticeSchema,
  normDefaultsSchema,
  ruleHandlingFromForm,
  supplementTypeSchema,
} from "@/lib/forms/settings";
import { customRulesSchema } from "@/lib/forms/custom-rules";
import type { Json } from "@/lib/supabase/database.types";
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

/** Edits a supplement type; pay already calculated (closed periods) is not changed. */
export async function updateSupplementTypeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireContext(["settings.manage"]);
  const values = formValues(formData);
  const id = z.guid().safeParse(values.id);
  const parsed = supplementTypeSchema.safeParse(values);
  if (!id.success) return { message: da.common.unknownError, values };
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("supplement_type")
    .update(parsed.data)
    .eq("id", id.data)
    .select("id");
  if (error)
    return {
      message: dbErrorMessage(error, { "23505": "Der findes allerede et tillæg med det navn." }),
      values,
    };
  if (!data?.length) return { message: da.common.notAllowed, values };
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

/** Turns the AI assistant on or off for the organization. */
export async function setAssistantEnabledAction(formData: FormData) {
  const ctx = await requireContext(["settings.manage"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("organization_settings")
    .update({ assistant_enabled: formData.get("enabled") === "true" })
    .eq("organization_id", ctx.organization.id);
  if (error) throw new Error(dbErrorMessage(error));
  revalidateSettings();
  revalidatePath("/vagtplan", "layout");
  revalidatePath("/lon", "layout");
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

/** Norm percent per shift kind (shifts and templates without their own value use it). */
export async function saveNormDefaultsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireContext(["settings.manage"]);
  const values = formValues(formData);
  const parsed = normDefaultsSchema.safeParse(values);
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
  revalidatePath("/lon", "layout");
  return { ok: true, message: da.common.saved };
}

/** The agreement preselected for new contracts (the database checks it is usable). */
export async function saveDefaultAgreementAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireContext(["settings.manage"]);
  const parsed = z
    .union([z.guid(), z.literal("")])
    .safeParse(formData.get("default_agreement_id") ?? "");
  if (!parsed.success) return { message: da.common.unknownError };
  const supabase = await createClient();
  const { error } = await supabase
    .from("organization_settings")
    .update({ default_agreement_id: parsed.data || null })
    .eq("organization_id", ctx.organization.id);
  if (error) return { message: dbErrorMessage(error) };
  revalidateSettings();
  revalidatePath("/medarbejdere", "layout");
  return { ok: true, message: da.common.saved };
}

/** The organization's own remark rules (validated with the rules engine). */
export async function saveCustomRulesAction(rules: unknown): Promise<ActionState> {
  const ctx = await requireContext(["settings.manage"]);
  const parsed = customRulesSchema.safeParse(rules);
  if (!parsed.success) {
    const custom = parsed.error.issues.find((i) => i.code === "custom");
    return { message: custom?.message ?? da.customRules.invalid };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_settings")
    .update({ custom_rules: parsed.data as unknown as NonNullable<Json> })
    .eq("organization_id", ctx.organization.id)
    .select("organization_id");
  if (error) return { message: dbErrorMessage(error) };
  if (!data?.length) return { message: da.common.notAllowed };
  revalidateSettings();
  revalidatePath("/tid", "layout");
  return { ok: true, message: da.customRules.saved };
}
