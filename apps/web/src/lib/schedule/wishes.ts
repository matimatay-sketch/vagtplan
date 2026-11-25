import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Whether a department uses the employees' wishes: its own setting, or the
 * organization's (null). When off, planning (the board, "Lav forslag" and the
 * assistant) ignores the wishes already made.
 */
export async function departmentUsesWishes(
  supabase: Supabase,
  organizationId: string,
  departmentId: string,
): Promise<boolean> {
  const [{ data: dept }, { data: settings }] = await Promise.all([
    supabase.from("department").select("availability_enabled").eq("id", departmentId).maybeSingle(),
    supabase
      .from("organization_settings")
      .select("availability_enabled")
      .eq("organization_id", organizationId)
      .maybeSingle(),
  ]);
  return dept?.availability_enabled ?? settings?.availability_enabled ?? true;
}
