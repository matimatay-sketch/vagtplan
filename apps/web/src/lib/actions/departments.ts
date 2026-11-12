"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { departmentSchema, fieldErrors } from "@/lib/forms/schemas";
import { da } from "@/lib/i18n/da";
import { dbErrorMessage, formValues, type ActionState } from "./state";

const nameTaken = { "23505": da.departments.nameTaken };

export async function createDepartmentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireContext(["admin"]);
  const values = formValues(formData);
  const parsed = departmentSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  const supabase = await createClient();
  const { error } = await supabase
    .from("department")
    .insert({ organization_id: ctx.organization.id, name: parsed.data.name });
  if (error) return { message: dbErrorMessage(error, nameTaken), values };
  revalidatePath("/afdelinger");
  return { ok: true, message: da.common.saved };
}

export async function renameDepartmentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireContext(["admin"]);
  const values = formValues(formData);
  const parsed = departmentSchema.extend({ id: z.guid() }).safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  const supabase = await createClient();
  const { error } = await supabase
    .from("department")
    .update({ name: parsed.data.name })
    .eq("id", parsed.data.id);
  if (error) return { message: dbErrorMessage(error, nameTaken), values };
  revalidatePath("/afdelinger");
  return { ok: true, message: da.common.saved };
}

export async function archiveDepartmentAction(formData: FormData) {
  await requireContext(["admin"]);
  const id = z.guid().parse(formData.get("id"));
  const supabase = await createClient();
  const { error } = await supabase
    .from("department")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(dbErrorMessage(error));
  revalidatePath("/afdelinger");
}

export async function addManagerAction(formData: FormData) {
  const ctx = await requireContext(["admin"]);
  const input = z
    .object({ department_id: z.guid(), user_id: z.guid() })
    .parse(Object.fromEntries(formData));
  const supabase = await createClient();
  const { error } = await supabase
    .from("department_manager")
    .insert({ ...input, organization_id: ctx.organization.id });
  if (error && error.code !== "23505") throw new Error(dbErrorMessage(error));
  revalidatePath("/afdelinger");
}

export async function removeManagerAction(formData: FormData) {
  await requireContext(["admin"]);
  const input = z
    .object({ department_id: z.guid(), user_id: z.guid() })
    .parse(Object.fromEntries(formData));
  const supabase = await createClient();
  const { error } = await supabase
    .from("department_manager")
    .delete()
    .eq("department_id", input.department_id)
    .eq("user_id", input.user_id);
  if (error) throw new Error(dbErrorMessage(error));
  revalidatePath("/afdelinger");
}
