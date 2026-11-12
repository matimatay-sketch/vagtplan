"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { availabilitySchema } from "@/lib/forms/availability";
import { fieldErrors } from "@/lib/forms/schemas";
import { todayIn } from "@/lib/domain/civil-date";
import { da } from "@/lib/i18n/da";
import { dbErrorMessage, formValues, type ActionState } from "./state";

export async function addAvailabilityAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireContext();
  if (!ctx.employee) return { message: da.common.notAllowed };
  const values = formValues(formData);
  const parsed = availabilitySchema(todayIn(ctx.organization.timezone)).safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  const supabase = await createClient();
  const { error } = await supabase
    .from("availability")
    .insert({ ...parsed.data, organization_id: ctx.organization.id, employee_id: ctx.employee.id });
  if (error) return { message: dbErrorMessage(error), values };
  revalidatePath("/min-vagtplan");
  return { ok: true, message: da.availability.saved };
}

export async function removeAvailabilityAction(formData: FormData) {
  await requireContext();
  const supabase = await createClient();
  const { error } = await supabase
    .from("availability")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", z.guid().parse(formData.get("id")));
  if (error) throw new Error(dbErrorMessage(error));
  revalidatePath("/min-vagtplan");
}
