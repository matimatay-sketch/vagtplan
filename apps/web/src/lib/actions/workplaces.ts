"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors } from "@/lib/forms/schemas";
import { workplaceSchema } from "@/lib/forms/workplace";
import { da } from "@/lib/i18n/da";
import { dbErrorMessage, formValues, type ActionState } from "./state";

const t = da.workplaces;

function revalidateWorkplaces() {
  revalidatePath("/indstillinger/arbejdspladser");
  revalidatePath("/indstillinger/opsaetning");
}

/** Creates or edits a workplace (id in the form) with its departments. */
export async function saveWorkplaceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireContext(["settings.manage"]);
  const values = formValues(formData);
  const parsed = workplaceSchema.safeParse({
    ...values,
    department_ids: formData.getAll("department_ids"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  const id = z
    .guid()
    .nullish()
    .parse(formData.get("id") || null);
  const w = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_workplace", {
    p_organization_id: ctx.organization.id,
    p_id: id ?? undefined,
    p_name: w.name,
    p_address: w.address ?? undefined,
    p_latitude: w.latitude,
    p_longitude: w.longitude,
    p_radius_m: w.radius_m,
    p_department_ids: w.department_ids,
  });
  if (error) return { message: dbErrorMessage(error), values };
  revalidateWorkplaces();
  return { ok: true, message: t.saved };
}

export async function archiveWorkplaceAction(id: string): Promise<ActionState> {
  const ctx = await requireContext(["settings.manage"]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workplace")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", z.guid().parse(id))
    .eq("organization_id", ctx.organization.id)
    .select("id");
  if (error) return { message: dbErrorMessage(error) };
  if (!data?.length) return { message: da.common.notAllowed };
  revalidateWorkplaces();
  return { ok: true, message: t.removed };
}

/** Employee wishes and stamping at the workplace, for the whole organization. */
export async function setEmployeeOptionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireContext(["settings.manage"]);
  const input = z
    .object({
      option: z.enum(["availability_enabled", "geofence_enabled"]),
      enabled: z.enum(["true", "false"]),
    })
    .parse(Object.fromEntries(formData));
  const enabled = input.enabled === "true";
  const supabase = await createClient();
  if (input.option === "geofence_enabled" && enabled) {
    // Without a workplace nobody could stamp.
    const { count } = await supabase
      .from("workplace")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", ctx.organization.id)
      .is("archived_at", null);
    if (!count) return { message: da.employeeOptions.needsWorkplace };
  }
  const { error } = await supabase
    .from("organization_settings")
    .update(
      input.option === "geofence_enabled"
        ? { geofence_enabled: enabled }
        : { availability_enabled: enabled },
    )
    .eq("organization_id", ctx.organization.id);
  if (error) return { message: dbErrorMessage(error) };
  revalidatePath("/indstillinger/opsaetning");
  revalidatePath("/min-vagtplan");
  revalidatePath("/vagtplan", "layout");
  revalidatePath("/tid", "layout");
  revalidatePath("/oversigt");
  return { ok: true, message: da.common.saved };
}
