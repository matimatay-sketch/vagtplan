"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { contractSchema, fieldErrors } from "@/lib/forms/schemas";
import { isValidIsoDate } from "@/lib/domain/civil-date";
import { da } from "@/lib/i18n/da";
import { dbErrorMessage, formValues, type ActionState } from "./state";

const overlap = { "23P01": da.contracts.overlap };

export async function createContractAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireContext(["contracts.manage"]);
  const values = formValues(formData);
  const employeeId = z.guid().safeParse(values.employee_id);
  const parsed = contractSchema.safeParse(values);
  if (!parsed.success || !employeeId.success)
    return { errors: parsed.success ? {} : fieldErrors(parsed.error), values };
  const supabase = await createClient();
  const { error } = await supabase
    .from("contract")
    .insert({ ...parsed.data, employee_id: employeeId.data, organization_id: ctx.organization.id });
  if (error) return { message: dbErrorMessage(error, overlap), values };
  revalidatePath(`/medarbejdere/${employeeId.data}`);
  return { ok: true, message: da.common.saved };
}

export async function endContractAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireContext(["contracts.manage"]);
  const values = formValues(formData);
  const input = z
    .object({
      id: z.guid(),
      employee_id: z.guid(),
      valid_to: z.string().refine(isValidIsoDate, da.validation.invalidDate),
    })
    .safeParse(values);
  if (!input.success) return { errors: fieldErrors(input.error), values };
  const supabase = await createClient();
  const { data: c } = await supabase
    .from("contract")
    .select("valid_from")
    .eq("id", input.data.id)
    .maybeSingle();
  if (!c) return { message: da.common.notAllowed };
  if (input.data.valid_to < c.valid_from)
    return { errors: { valid_to: da.validation.endBeforeStart }, values };
  const { error } = await supabase
    .from("contract")
    .update({ valid_to: input.data.valid_to })
    .eq("id", input.data.id);
  if (error) return { message: dbErrorMessage(error, overlap), values };
  revalidatePath(`/medarbejdere/${input.data.employee_id}`);
  return { ok: true, message: da.common.saved };
}
