"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { da } from "@/lib/i18n/da";
import { dbErrorMessage, type ActionState } from "./state";

const t = da.employeeGroups;
const name = z.string().trim().min(1, da.validation.required).max(80, da.validation.tooLong);

function revalidate() {
  revalidatePath("/indstillinger/opsaetning");
  revalidatePath("/medarbejdere", "layout");
}

/** Creates a group (no id) or renames one. */
export async function saveEmployeeGroupAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireContext(["settings.manage"]);
  const parsed = name.safeParse(formData.get("name"));
  if (!parsed.success)
    return { errors: { name: parsed.error.issues[0]!.message }, values: { name: "" } };
  const id = z.guid().safeParse(formData.get("id")).data;
  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("employee_group").update({ name: parsed.data }).eq("id", id).select("id")
    : await supabase
        .from("employee_group")
        .insert({ name: parsed.data, organization_id: ctx.organization.id })
        .select("id");
  if (error) return { message: dbErrorMessage(error, { "23505": t.exists }) };
  if (!data?.length) return { message: da.common.notAllowed };
  revalidate();
  return { ok: true, message: id ? da.common.saved : t.created };
}

/** Deletes (archives) a group; its employees lose it. */
export async function archiveEmployeeGroupAction(id: string): Promise<ActionState> {
  await requireContext(["settings.manage"]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_group")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", z.guid().parse(id))
    .select("id");
  if (error) return { message: dbErrorMessage(error) };
  if (!data?.length) return { message: da.common.notAllowed };
  revalidate();
  return { ok: true, message: t.removed };
}
