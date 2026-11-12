import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export type AppRole = Database["public"]["Enums"]["app_role"];

export const ACTIVE_ORG_COOKIE = "active_org";

export type AppContext = {
  userId: string;
  email: string;
  organization: { id: string; name: string; timezone: string };
  role: AppRole;
  managedDepartmentIds: string[];
  employee: { id: string; first_name: string; last_name: string } | null;
  organizations: { id: string; name: string; role: AppRole }[];
};

/**
 * Data Access Layer entry point. Resolves the signed-in user, their
 * memberships and the active organization once per request.
 * Returns null when not signed in; redirects to /opret when the user has no
 * organization yet.
 */
export const getAppContext = cache(async (): Promise<AppContext | null> => {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  if (!claims) return null;
  const userId = claims.sub;

  const { data: memberships, error } = await supabase
    .from("membership")
    .select("role, organization:organization_id (id, name, timezone)")
    .eq("user_id", userId);
  if (error) throw error;

  const organizations = (memberships ?? [])
    .filter((m) => m.organization)
    .map((m) => ({ ...m.organization!, role: m.role }));
  if (organizations.length === 0) return null;

  const preferred = (await cookies()).get(ACTIVE_ORG_COOKIE)?.value;
  const active = organizations.find((o) => o.id === preferred) ?? organizations[0]!;

  const [{ data: managed }, { data: employee }] = await Promise.all([
    supabase
      .from("department_manager")
      .select("department_id")
      .eq("user_id", userId)
      .eq("organization_id", active.id),
    supabase
      .from("employee")
      .select("id, first_name, last_name")
      .eq("user_id", userId)
      .eq("organization_id", active.id)
      .maybeSingle(),
  ]);

  return {
    userId,
    email: typeof claims.email === "string" ? claims.email : "",
    organization: { id: active.id, name: active.name, timezone: active.timezone },
    role: active.role,
    managedDepartmentIds:
      active.role === "manager" ? (managed ?? []).map((m) => m.department_id) : [],
    employee: employee ?? null,
    organizations: organizations.map(({ id, name, role }) => ({ id, name, role })),
  };
});

/** Requires a signed-in user with an organization, optionally with one of `roles`. */
export async function requireContext(roles?: readonly AppRole[]): Promise<AppContext> {
  const ctx = await getAppContext();
  if (!ctx) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    redirect(data?.claims ? "/opret" : "/login");
  }
  if (roles && !roles.includes(ctx.role)) redirect("/oversigt?adgang=nej");
  return ctx;
}

export const canManagePeople = (role: AppRole) => role === "admin" || role === "manager";
