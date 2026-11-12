"use server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { da } from "@/lib/i18n/da";
import { fieldErrors, signInSchema, signUpSchema } from "@/lib/forms/schemas";
import { ACTIVE_ORG_COOKIE, getAppContext } from "@/lib/auth";
import { dbErrorMessage, formValues, type ActionState } from "./state";
import { z } from "zod";

export async function signInAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData);
  delete values.password;
  const parsed = signInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { message: da.auth.invalidCredentials, values };
  redirect("/oversigt");
}

export async function magicLinkAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const values = formValues(formData);
  const parsed = z.object({ email: z.email(da.validation.invalidEmail) }).safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { shouldCreateUser: false, emailRedirectTo: `${env.siteUrl}/auth/callback` },
  });
  // Do not reveal whether the address exists.
  if (error && error.status !== 422 && error.status !== 400)
    return { message: da.common.unknownError, values };
  return { ok: true, message: da.auth.magicLinkSent, values };
}

export async function signUpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData);
  delete values.password;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();

  if (!claims?.claims) {
    const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    if (error)
      return {
        message:
          error.code === "user_already_exists"
            ? "E-mailen er allerede i brug."
            : da.common.unknownError,
        values,
      };
  }

  const name = z.string().trim().min(1).max(200).safeParse(formData.get("organization_name"));
  if (!name.success) return { errors: { organization_name: da.validation.required }, values };
  const { data: orgId, error } = await supabase.rpc("create_organization", { org_name: name.data });
  if (error || !orgId) return { message: dbErrorMessage(error), values };
  (await cookies()).set(ACTIVE_ORG_COOKIE, orgId, { path: "/", sameSite: "lax", httpOnly: true });
  redirect("/oversigt");
}

export async function switchOrganizationAction(id: string) {
  const ctx = await getAppContext();
  if (!ctx?.organizations.some((o) => o.id === id)) return;
  (await cookies()).set(ACTIVE_ORG_COOKIE, id, { path: "/", sameSite: "lax", httpOnly: true });
  redirect("/oversigt");
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
