"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/auth";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { fieldErrors } from "@/lib/forms/schemas";
import { customerFormSchema, inviteAdminSchema } from "@/lib/forms/platform";
import { da } from "@/lib/i18n/da";
import { dbErrorMessage, formValues, type ActionState } from "./state";

/**
 * Makes `email` administrator of `organizationId`. An unknown address gets an
 * invitation through the service client – only after the database has
 * confirmed (via the caller's own session) that the caller is a platform
 * administrator.
 */
async function addAdministrator(organizationId: string, email: string): Promise<string | null> {
  const supabase = await createClient();
  const { data: existing, error: lookupError } = await supabase.rpc("platform_user_id", {
    p_email: email,
  });
  if (lookupError) return dbErrorMessage(lookupError);

  let userId = existing;
  if (!userId) {
    const service = createServiceClient();
    const { data, error } = await service.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${env.siteUrl}/auth/callback`,
    });
    if (error || !data.user) return da.platform.inviteFailed;
    userId = data.user.id;
  }
  const { error } = await supabase.rpc("platform_add_owner", {
    p_org: organizationId,
    p_user: userId,
  });
  return error ? dbErrorMessage(error) : null;
}

export async function createCustomerAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePlatformAdmin();
  const values = formValues(formData);
  const parsed = customerFormSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const supabase = await createClient();
  const { data: orgId, error } = await supabase.rpc("platform_create_organization", {
    p_name: parsed.data.name,
    ...(parsed.data.starter_kit ? { p_starter_kit: parsed.data.starter_kit } : {}),
  });
  if (error || !orgId) return { message: dbErrorMessage(error), values };
  revalidatePath("/platform");
  // The customer exists even if the invitation fails; it can be resent from the list.
  const problem = await addAdministrator(orgId, parsed.data.admin_email);
  if (problem) return { message: problem, values };
  return { ok: true, message: da.platform.created };
}

export async function inviteCustomerAdminAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePlatformAdmin();
  const values = formValues(formData);
  const parsed = inviteAdminSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  const problem = await addAdministrator(parsed.data.organization_id, parsed.data.admin_email);
  if (problem) return { message: problem, values };
  revalidatePath("/platform");
  return { ok: true, message: da.platform.invited };
}

export async function setCustomerArchivedAction(formData: FormData) {
  await requirePlatformAdmin();
  const p = z
    .object({ organization_id: z.guid(), archived: z.enum(["true", "false"]) })
    .parse(Object.fromEntries(formData));
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_set_archived", {
    p_org: p.organization_id,
    p_archived: p.archived === "true",
  });
  if (error) throw new Error(dbErrorMessage(error));
  revalidatePath("/platform");
}
