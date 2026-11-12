import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  canInDepartment,
  hasAny,
  isPermissionKey,
  type PermissionKey,
  type Permissions,
} from "@/lib/permissions";

export const ACTIVE_ORG_COOKIE = "active_org";

export type AppContext = {
  userId: string;
  email: string;
  organization: { id: string; name: string; timezone: string };
  profile: { id: string; name: string; isOwner: boolean };
  permissions: Permissions;
  /** Departments the user is responsible for (scope "Egne afdelinger"). */
  responsibleDepartmentIds: string[];
  employee: { id: string; first_name: string; last_name: string } | null;
  organizations: { id: string; name: string }[];
};

/**
 * Data Access Layer entry point. Resolves the signed-in user, the active
 * organization, their permission profile and permissions once per request.
 * Returns null when not signed in or without any organization.
 * UI checks are a convenience; RLS is the real access control.
 */
export const getAppContext = cache(async (): Promise<AppContext | null> => {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  if (!claims) return null;
  const userId = claims.sub;

  const { data: memberships, error } = await supabase
    .from("membership")
    .select(
      "organization:organization_id (id, name, timezone), profile:permission_profile!membership_profile_fk (id, name, is_owner)",
    )
    .eq("user_id", userId);
  if (error) throw error;

  const usable = (memberships ?? []).filter((m) => m.organization && m.profile);
  if (usable.length === 0) return null;

  const preferred = (await cookies()).get(ACTIVE_ORG_COOKIE)?.value;
  const active = usable.find((m) => m.organization!.id === preferred) ?? usable[0]!;
  const org = active.organization!;

  const [{ data: grants }, { data: responsible }, { data: employee }] = await Promise.all([
    supabase.rpc("my_permissions", { org: org.id }),
    supabase
      .from("department_manager")
      .select("department_id")
      .eq("user_id", userId)
      .eq("organization_id", org.id),
    supabase
      .from("employee")
      .select("id, first_name, last_name")
      .eq("user_id", userId)
      .eq("organization_id", org.id)
      .maybeSingle(),
  ]);

  const permissions: Permissions = {};
  for (const g of grants ?? [])
    if (isPermissionKey(g.permission)) permissions[g.permission] = g.scope;

  return {
    userId,
    email: typeof claims.email === "string" ? claims.email : "",
    organization: { id: org.id, name: org.name, timezone: org.timezone },
    profile: {
      id: active.profile!.id,
      name: active.profile!.name,
      isOwner: active.profile!.is_owner,
    },
    permissions,
    responsibleDepartmentIds: (responsible ?? []).map((r) => r.department_id),
    employee: employee ?? null,
    organizations: usable.map((m) => ({ id: m.organization!.id, name: m.organization!.name })),
  };
});

/**
 * Requires a signed-in user with an organization. When `anyOf` is given, the
 * user needs at least one of those permissions (any scope).
 */
export async function requireContext(anyOf?: readonly PermissionKey[]): Promise<AppContext> {
  const ctx = await getAppContext();
  if (!ctx) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    redirect(data?.claims ? "/opret" : "/login");
  }
  if (anyOf && !hasAny(ctx.permissions, anyOf)) redirect("/oversigt?adgang=nej");
  return ctx;
}

/** Can the user use `key` in this department (organization scope, or responsible for it)? */
export function canIn(ctx: AppContext, key: PermissionKey, departmentId: string): boolean {
  return canInDepartment(ctx.permissions, key, departmentId, ctx.responsibleDepartmentIds);
}
