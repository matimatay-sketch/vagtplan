"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors } from "@/lib/forms/schemas";
import { projectFormSchema } from "@/lib/forms/projects";
import { da } from "@/lib/i18n/da";
import { dbErrorMessage, formValues, type ActionState } from "./state";

const numberTaken = { "23505": da.projects.numberTaken };

function revalidateProjects() {
  revalidatePath("/projekter", "layout");
  revalidatePath("/vagtplan", "layout");
  revalidatePath("/tid", "layout");
  revalidatePath("/indstillinger/kontering");
}

/** The organization's project dimension, created on first use. */
async function projectDimensionId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("posting_dimension")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("is_project", true)
    .is("archived_at", null)
    .maybeSingle();
  if (data) return data.id;
  const { data: created } = await supabase
    .from("posting_dimension")
    .insert({
      organization_id: organizationId,
      key: "projekt",
      name: da.projects.dimensionName,
      is_project: true,
      sort_order: -1,
    })
    .select("id")
    .single();
  return created?.id ?? null;
}

/**
 * Creates or updates a project – a value of the project posting dimension –
 * and its department restriction.
 */
export async function saveProjectAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireContext(["projects.manage"]);
  const values = formValues(formData);
  const parsed = projectFormSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  const { id, department_ids, number, name, customer } = parsed.data;
  const fields = { code: number, name, description: customer };
  const supabase = await createClient();
  const dimensionId = await projectDimensionId(supabase, ctx.organization.id);
  if (!dimensionId) return { message: da.common.notAllowed, values };

  let projectId = id;
  if (id) {
    const { data, error } = await supabase
      .from("posting_value")
      .update(fields)
      .eq("id", id)
      .is("archived_at", null)
      .select("id");
    if (error) return { message: dbErrorMessage(error, numberTaken), values };
    if (!data?.length) return { message: da.common.unknownError, values };
  } else {
    const { data, error } = await supabase
      .from("posting_value")
      .insert({ ...fields, organization_id: ctx.organization.id, dimension_id: dimensionId })
      .select("id")
      .single();
    if (error) return { message: dbErrorMessage(error, numberTaken), values };
    projectId = data.id;
  }

  // Department restriction: link rows are configuration (audited), changed as a diff.
  const { data: current, error: readError } = await supabase
    .from("posting_value_department")
    .select("department_id")
    .eq("value_id", projectId!);
  if (readError) return { message: dbErrorMessage(readError), values };
  const have = new Set((current ?? []).map((r) => r.department_id));
  const want = new Set(department_ids);
  const removed = [...have].filter((d) => !want.has(d));
  const added = [...want].filter((d) => !have.has(d));
  if (removed.length) {
    const { error } = await supabase
      .from("posting_value_department")
      .delete()
      .eq("value_id", projectId!)
      .in("department_id", removed);
    if (error) return { message: dbErrorMessage(error), values };
  }
  if (added.length) {
    const { error } = await supabase.from("posting_value_department").insert(
      added.map((department_id) => ({
        organization_id: ctx.organization.id,
        value_id: projectId!,
        department_id,
      })),
    );
    if (error) return { message: dbErrorMessage(error), values };
  }
  revalidateProjects();
  return { ok: true, message: da.common.saved };
}

export async function archiveProjectAction(formData: FormData) {
  await requireContext(["projects.manage"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("posting_value")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", z.guid().parse(formData.get("id")));
  if (error) throw new Error(dbErrorMessage(error));
  revalidateProjects();
}
