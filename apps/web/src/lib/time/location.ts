import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Whether this employee's stamps must carry the position (the server checks it again). */
export async function stampNeedsLocation(
  supabase: Supabase,
  organizationId: string,
  employeeId: string,
): Promise<boolean> {
  const [{ data: settings }, { data: employee }] = await Promise.all([
    supabase
      .from("organization_settings")
      .select("geofence_enabled")
      .eq("organization_id", organizationId)
      .maybeSingle(),
    supabase.from("employee").select("stamp_anywhere").eq("id", employeeId).maybeSingle(),
  ]);
  return Boolean(settings?.geofence_enabled) && !employee?.stamp_anywhere;
}
