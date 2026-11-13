import "server-only";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

/** Active projects with their department restriction (empty = all departments). */
export async function loadProjectOptions(supabase: Client, organizationId: string) {
  const { data } = await supabase
    .from("project")
    .select("id, number, name, project_department (department_id)")
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .order("number");
  return (data ?? []).map((p) => ({
    id: p.id,
    number: p.number,
    name: p.name,
    departmentIds: p.project_department.map((d) => d.department_id),
  }));
}
