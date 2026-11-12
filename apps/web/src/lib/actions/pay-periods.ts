"use server";
import { revalidatePath } from "next/cache";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, payPeriodGroupSchema } from "@/lib/forms/schemas";
import { da } from "@/lib/i18n/da";
import { dbErrorMessage, formValues, type ActionState } from "./state";

export async function createPayPeriodGroupAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireContext(["admin"]);
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
