"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  PERMISSIONS,
  normalizeGrants,
  type PermissionScope,
  type Permissions,
} from "@/lib/permissions";
import { da } from "@/lib/i18n/da";
import { fieldErrors } from "@/lib/forms/schemas";
import { dbErrorMessage, formValues, type ActionState } from "./state";

const profileNameSchema = z.object({
  name: z.string().trim().min(1, da.validation.required).max(100, da.validation.tooLong),
  description: z
    .string()
    .trim()
    .max(300, da.validation.tooLong)
    .optional()
    .transform((s) => s || null),
});

function revalidateAccess() {
  revalidatePath("/indstillinger/rettigheder");
  revalidatePath("/medarbejdere", "layout");
}

export async function createProfileAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireContext(["users.manage"]);
  const values = formValues(formData);
  const parsed = profileNameSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  const supabase = await createClient();
  const { error } = await supabase
    .from("permission_profile")
    .insert({ ...parsed.data, organization_id: ctx.organization.id });
  if (error)
    return {
      message: dbErrorMessage(error, { "23505": "Der findes allerede en profil med det navn." }),
      values,
    };
  revalidateAccess();
  return { ok: true, message: da.common.saved };
}

/** Renames a profile (the locked owner profile cannot change; the database checks). */
export async function renameProfileAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireContext(["users.manage"]);
  const values = formValues(formData);
  const id = z.guid().safeParse(values.profile_id);
  const parsed = profileNameSchema.safeParse(values);
  if (!id.success) return { message: da.common.unknownError, values };
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("permission_profile")
    .update(parsed.data)
    .eq("id", id.data)
    .eq("is_owner", false)
    .select("id");
  if (error)
    return {
      message: dbErrorMessage(error, { "23505": "Der findes allerede en profil med det navn." }),
      values,
    };
  if (!data?.length) return { message: da.common.notAllowed, values };
  revalidateAccess();
  return { ok: true, message: da.common.saved };
}

/** Replaces all grants of a profile with the submitted matrix. */
export async function saveGrantsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireContext(["users.manage"]);
  const profileId = z.guid().safeParse(formData.get("profile_id"));
  if (!profileId.success) return { message: da.common.unknownError };

  const submitted: Permissions = {};
  for (const p of PERMISSIONS) {
    const v = formData.get(`perm:${p.key}`);
    if (v === "departments" || v === "organization") submitted[p.key] = v as PermissionScope;
  }
  const grants = normalizeGrants(submitted);

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("permission_profile")
    .select("id, is_owner")
    .eq("id", profileId.data)
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();
  if (!profile || profile.is_owner) return { message: da.common.notAllowed };

  const { error } = await supabase.rpc("set_profile_grants", {
    p_profile_id: profile.id,
    p_grants: grants,
  });
  if (error) return { message: dbErrorMessage(error) };
  revalidateAccess();
  revalidatePath("/", "layout");
  return { ok: true, message: da.common.saved };
}

export async function archiveProfileAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireContext(["users.manage"]);
  const id = z.guid().parse(formData.get("profile_id"));
  const supabase = await createClient();
  const [{ count }, { data: org }] = await Promise.all([
    supabase.from("membership").select("id", { count: "exact", head: true }).eq("profile_id", id),
    supabase
      .from("organization")
      .select("default_profile_id")
      .eq("id", ctx.organization.id)
      .single(),
  ]);
  if ((count ?? 0) > 0 || org?.default_profile_id === id) return { message: da.profiles.inUse };
  const { error } = await supabase
    .from("permission_profile")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { message: dbErrorMessage(error) };
  revalidateAccess();
  return { ok: true, message: da.common.saved };
}

export async function setDefaultProfileAction(formData: FormData) {
  const ctx = await requireContext(["users.manage"]);
  const id = z.guid().parse(formData.get("profile_id"));
  const supabase = await createClient();
  // Updating organization requires settings.manage as well; both are org-level admin tasks.
  const { error } = await supabase
    .from("organization")
    .update({ default_profile_id: id })
    .eq("id", ctx.organization.id);
  if (error) throw new Error(dbErrorMessage(error));
  revalidateAccess();
}

export async function changeMemberProfileAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireContext(["users.manage"]);
  const input = z
    .object({ user_id: z.guid(), profile_id: z.guid() })
    .safeParse(Object.fromEntries(formData));
  if (!input.success) return { message: da.common.unknownError };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("membership")
    .update({ profile_id: input.data.profile_id })
    .eq("organization_id", ctx.organization.id)
    .eq("user_id", input.data.user_id)
    .select("id");
  if (error) return { message: dbErrorMessage(error, { "42501": da.users.lastOwner }) };
  if (!data?.length) return { message: da.common.notAllowed };
  revalidateAccess();
  revalidatePath("/", "layout");
  return { ok: true, message: da.common.saved };
}
