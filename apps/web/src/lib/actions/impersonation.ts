"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireContext } from "@/lib/auth";
import {
  IMPERSONATION_COOKIE,
  IMPERSONATOR_COOKIE,
  createClient,
  createServiceClient,
} from "@/lib/supabase/server";
import { seal, unseal } from "@/lib/impersonation-seal";
import { da } from "@/lib/i18n/da";

const t = da.impersonation;
const secret = () => {
  const s = process.env.SUPABASE_SECRET_KEY;
  if (!s) throw new Error("Missing SUPABASE_SECRET_KEY");
  return s;
};
const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 12 * 3600,
};

/**
 * Logs the administrator in as an employee. The database decides whether it is
 * allowed (can_impersonate / start_impersonation); only then is the service
 * client used to create a background login (if the employee has none) and to
 * issue a session for the employee. The administrator's own session is sealed
 * in a cookie and restored by stopImpersonationAction.
 */
export async function impersonateAction(employeeId: string): Promise<{ message: string } | void> {
  const ctx = await requireContext(["users.impersonate"]);
  const id = z.guid().parse(employeeId);
  const supabase = await createClient();
  const { data: check } = await supabase.rpc("can_impersonate", { p_employee_id: id });
  const c = check?.[0];
  if (!c?.allowed)
    return { message: t.reasons[c?.reason ?? "not_allowed"] ?? da.common.notAllowed };
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { message: da.common.notAllowed };

  const service = createServiceClient();
  let email = c.email;
  if (!c.user_id) {
    // A login without e-mail: confirmed, no password, never sent anywhere.
    const { data: employee } = await supabase
      .from("employee")
      .select("id, organization_id")
      .eq("id", id)
      .single();
    const { data: org } = await supabase
      .from("organization")
      .select("default_profile_id")
      .eq("id", ctx.organization.id)
      .single();
    if (!employee || !org?.default_profile_id) return { message: da.common.unknownError };
    email = `medarbejder-${id}@login.turnus.invalid`;
    const { data: created, error } = await service.auth.admin.createUser({
      email,
      email_confirm: true,
      app_metadata: { turnus_placeholder: true },
    });
    if (error || !created.user) return { message: da.common.unknownError };
    const userId = created.user.id;
    const [{ error: memberError }, { error: linkError }] = await Promise.all([
      service.from("membership").insert({
        organization_id: employee.organization_id,
        user_id: userId,
        profile_id: org.default_profile_id,
      }),
      service.from("employee").update({ user_id: userId, login_placeholder: true }).eq("id", id),
    ]);
    if (memberError || linkError) return { message: da.common.unknownError };
  }
  if (!email) return { message: da.common.unknownError };

  const { data: sid, error: startError } = await supabase.rpc("start_impersonation", {
    p_employee_id: id,
  });
  if (startError || !sid) return { message: da.common.notAllowed };
  const { data: link, error: linkError } = await service.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkError || !link.properties?.hashed_token) return { message: da.common.unknownError };

  const store = await cookies();
  store.set(IMPERSONATOR_COOKIE, seal(session.refresh_token, secret()), cookieOptions);
  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: link.properties.hashed_token,
  });
  if (verifyError) {
    store.delete(IMPERSONATOR_COOKIE);
    return { message: da.common.unknownError };
  }
  store.set(IMPERSONATION_COOKIE, sid, cookieOptions);
  redirect("/oversigt");
}

/** Back to the administrator's own user. */
export async function stopImpersonationAction() {
  const store = await cookies();
  const sid = store.get(IMPERSONATION_COOKIE)?.value;
  const sealed = store.get(IMPERSONATOR_COOKIE)?.value;
  const supabase = await createClient();
  if (sid) await supabase.rpc("end_impersonation", { p_session: sid });
  await supabase.auth.signOut({ scope: "local" });
  store.delete(IMPERSONATION_COOKIE);
  store.delete(IMPERSONATOR_COOKIE);
  const token = sealed ? unseal(sealed, secret()) : null;
  if (token) {
    const fresh = await createClient();
    const { error } = await fresh.auth.refreshSession({ refresh_token: token });
    if (!error) redirect("/medarbejdere");
  }
  redirect("/login");
}
